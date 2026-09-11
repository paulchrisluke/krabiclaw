import { localDateTimeToInstant } from '~/utils/timezone'
import type { D1Database } from '@cloudflare/workers-types'
import { queryAll } from '~/server/db'
import { resolveLocationTimezone } from '~/server/utils/site-config'
import type { ReviewBookingType } from '~/server/utils/review-requests'
import { executeGuestThreadOperation } from '~/server/domain/guest-threads/operations'
import { sendReviewRequestForBooking } from '~/server/utils/review-request-delivery'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { collectScheduledPaidRows } from '~/server/utils/scheduled-billing-access'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'

interface ReviewRequestTaskContext {
  cloudflare?: { env?: ApiRecord }
}

interface AutoCompleteRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  booking_date: string
  time_slot: string
  duration_minutes: number | null
  access_plan: string | null
  access_expires_at: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  updated_at: string | null
}

interface SendDueRow {
  id: string
  organization_id: string
  site_id: string
  booking_type: ReviewBookingType
  access_plan: string | null
  access_expires_at: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  updated_at: string | null
}

interface TaskResult {
  completed: number
  reservations_completed?: number
  bookings_completed?: number
  first_sent: number
  reminders_sent: number
  failed: number
  skipped?: string
}

async function autoCompleteBookings(db: D1Database, env: ApiRecord, kind: ReviewBookingType): Promise<number> {
  const rows = await collectScheduledPaidRows((limit, offset) => queryAll<AutoCompleteRow>(db, `
      SELECT r.id, r.organization_id, r.site_id, r.location_id, r.booking_date, r.time_slot,
             cfg.duration_minutes AS duration_minutes,
             ob.access_plan, ob.access_expires_at, ob.payment_status, ob.paid_through, ob.past_due_since, ob.updated_at
        FROM requests r LEFT JOIN products p ON p.id = r.product_id
        JOIN organization_billing ob ON ob.organization_id = r.organization_id AND ob.access_plan = 'growth'
       WHERE r.kind = ? AND r.status = 'confirmed' AND json_extract(r.payload_json, '$.completion.at') IS NULL
       ORDER BY r.id LIMIT ? OFFSET ?
    `, [kind, limit, offset]), 'review_requests')
  let completed = 0
  for (const row of rows) {
    const timezone = await resolveLocationTimezone(db, row.organization_id, row.site_id, row.location_id)
    const duration = kind === 'reservation' ? 180 : row.duration_minutes ?? 360
    if (Date.now() < localDateTimeToInstant(row.booking_date, row.time_slot, timezone).getTime() + duration * 60_000) continue
    const outcome = await executeGuestThreadOperation(db, { threadId: row.id, siteId: row.site_id, action: 'complete', actorUserId: null, completionSource: 'auto', env, idempotencyKey: `auto-complete:${row.id}` })
    if (outcome.ok) {
      completed += 1
      await publishGuestInboxThreadEvent(env, db, { threadId: row.id, type: 'thread.changed' })
    } else if (outcome.status !== 409) {
      throw new Error(`Automatic completion failed: ${outcome.reason}`)
    }
  }
  return completed
}

async function sendDue(db: D1Database, env: ApiRecord, kind: 'first' | 'reminder'): Promise<{ sent: number; failed: number }> {
  const reservationDelay = kind === 'first' ? '-2 hours' : '-5 days'
  const experienceDelay = kind === 'first' ? '-24 hours' : '-5 days'
  const rows = await collectScheduledPaidRows((limit, offset) => queryAll<SendDueRow>(db, `
      SELECT r.id, r.organization_id, r.site_id, r.kind AS booking_type,
             ob.access_plan, ob.access_expires_at, ob.payment_status, ob.paid_through, ob.past_due_since, ob.updated_at
        FROM requests r JOIN customers c ON c.id = r.customer_id
        JOIN organization_billing ob ON ob.organization_id = r.organization_id AND ob.access_plan = 'growth'
       WHERE r.kind IN ('reservation', 'booking') AND r.status = 'completed'
         AND json_extract(r.payload_json, '$.completion.at') IS NOT NULL
         AND json_extract(r.payload_json, '$.review.submitted_at') IS NULL
         AND c.review_request_opted_out_at IS NULL
         AND ${kind === 'first'
           ? "json_extract(r.payload_json, '$.review.request_sent_at') IS NULL AND datetime(json_extract(r.payload_json, '$.completion.at')) <= datetime('now', CASE r.kind WHEN 'reservation' THEN ? ELSE ? END)"
           : "json_extract(r.payload_json, '$.review.request_sent_at') IS NOT NULL AND json_extract(r.payload_json, '$.review.reminder_sent_at') IS NULL AND datetime(json_extract(r.payload_json, '$.review.request_sent_at')) <= datetime('now', CASE r.kind WHEN 'reservation' THEN ? ELSE ? END)"}
       ORDER BY booking_type, r.id LIMIT ? OFFSET ?
    `, [reservationDelay, experienceDelay, limit, offset]), 'review_requests')

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
      return { result: { completed: 0, first_sent: 0, reminders_sent: 0, failed: 0, skipped: 'DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('DB is required')

    const reservationsCompleted = await autoCompleteBookings(db, env, 'reservation')
    const experiencesCompleted = await autoCompleteBookings(db, env, 'booking')
    const first = await sendDue(db, env, 'first')
    const reminders = await sendDue(db, env, 'reminder')

    return {
      result: {
        completed: reservationsCompleted + experiencesCompleted,
        reservations_completed: reservationsCompleted,
        bookings_completed: experiencesCompleted,
        first_sent: first.sent,
        reminders_sent: reminders.sent,
        failed: first.failed + reminders.failed,
      },
    }
  },
})
