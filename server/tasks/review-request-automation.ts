import type { D1Database } from '@cloudflare/workers-types'
import { queryAllPages } from '~/server/db'
import type { ReviewBookingType } from '~/server/utils/review-requests'
import { sendReviewRequestForBooking } from '~/server/utils/review-request-delivery'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { filterEntitledRows } from '~/server/utils/billing-access'
import type { CloudflareEnv } from '~/server/utils/auth'

interface ReviewRequestTaskContext {
  cloudflare?: { env?: ApiRecord }
}


interface SendDueRow {
  id: string
  organization_id: string
  site_id: string
  booking_type: ReviewBookingType
}

interface TaskResult {
  first_sent: number
  reminders_sent: number
  failed: number
  skipped?: string
}

async function sendDue(db: D1Database, env: ApiRecord, kind: 'first' | 'reminder'): Promise<{ sent: number; failed: number }> {
  const reservationDelay = kind === 'first' ? '-2 hours' : '-5 days'
  const experienceDelay = kind === 'first' ? '-24 hours' : '-5 days'
  const candidates = await queryAllPages<SendDueRow>(db, `
      SELECT r.id, r.organization_id, r.site_id, r.kind AS booking_type
        FROM requests r JOIN customers c ON c.id = r.customer_id
        JOIN (
          SELECT b.request_id, b.status, ps.ends_at FROM bookings b JOIN product_sessions ps ON ps.id = b.product_session_id
          UNION ALL
          SELECT request_id, status, ends_at FROM reservations
        ) record ON record.request_id = r.id
       -- Done is the clock: confirmed, and its end has passed. There is no
       -- stored completion stamp to wait for, so the visit's own end is when
       -- the review clock starts.
       WHERE r.kind IN ('reservation', 'booking') AND record.status = 'confirmed'
         AND datetime(record.ends_at) <= datetime('now')
         AND json_extract(r.payload_json, '$.review.submitted_at') IS NULL
         AND c.review_request_opted_out_at IS NULL
         AND ${kind === 'first'
           ? "json_extract(r.payload_json, '$.review.request_sent_at') IS NULL AND datetime(record.ends_at) <= datetime('now', CASE r.kind WHEN 'reservation' THEN ? ELSE ? END)"
           : "json_extract(r.payload_json, '$.review.request_sent_at') IS NOT NULL AND json_extract(r.payload_json, '$.review.reminder_sent_at') IS NULL AND datetime(json_extract(r.payload_json, '$.review.request_sent_at')) <= datetime('now', CASE r.kind WHEN 'reservation' THEN ? ELSE ? END)"}
       ORDER BY booking_type, r.id
    `, [reservationDelay, experienceDelay])
  const rows = await filterEntitledRows(env as CloudflareEnv, candidates, 'review_requests')

  let sent = 0
  let failed = 0
  for (const row of rows) {
    const result = await sendReviewRequestForBooking(env, db, row.booking_type, row.id, kind).catch((error) => ({
      sent: false,
      requestId: '',
      error: error instanceof Error ? error.message : String(error),
    }))
    if (result.sent) sent += 1
    else failed += 1
  }
  return { sent, failed }
}

export default defineScheduledTask({
  meta: {
    name: 'review-request-automation',
    description: 'Completes bookings and sends entitled post-booking review requests',
  },
  async run({ context }): Promise<{ result: TaskResult }> {
    const taskContext = context as ReviewRequestTaskContext | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB as D1Database | undefined

    if (!db && import.meta.dev) {
      return { result: { first_sent: 0, reminders_sent: 0, failed: 0, skipped: 'DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('DB is required')

    const first = await sendDue(db, env, 'first')
    const reminders = await sendDue(db, env, 'reminder')

    return {
      result: {
        first_sent: first.sent,
        reminders_sent: reminders.sent,
        failed: first.failed + reminders.failed,
      },
    }
  },
})
