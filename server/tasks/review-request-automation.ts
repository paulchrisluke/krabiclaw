import type { D1Database } from '@cloudflare/workers-types'
import { queryAll } from '~/server/db'
import type { ReviewBookingType } from '~/server/utils/review-requests'
import { executeGuestThreadOperation } from '~/server/domain/guest-threads/operations'
import { sendReviewRequestForBooking } from '~/server/utils/review-request-delivery'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { filterEntitledRows } from '~/server/utils/billing-access'
import type { CloudflareEnv } from '~/server/utils/auth'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'

interface ReviewRequestTaskContext {
  cloudflare?: { env?: ApiRecord }
}

const REVIEW_CANDIDATE_LIMIT = 2000

interface AutoCompleteRow {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  ends_at: string
  duration_minutes: number | null
}

interface SendDueRow {
  id: string
  organization_id: string
  site_id: string
  booking_type: ReviewBookingType
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
  // When it happened and how long it runs belong to the record — a session for
  // a booking, the held table for a reservation — so the sweep reads them
  // there rather than from a thread that no longer carries them.
  const candidates = await queryAll<AutoCompleteRow>(db, `
      SELECT r.id, r.organization_id, r.site_id, record.location_id, record.ends_at
        FROM requests r
        JOIN (
          SELECT b.request_id, b.status, ps.location_id, ps.ends_at FROM bookings b JOIN product_sessions ps ON ps.id = b.product_session_id
          UNION ALL
          SELECT res.request_id, res.status, res.location_id, res.ends_at FROM reservations res
        ) record ON record.request_id = r.id
       WHERE r.kind = ? AND record.status = 'confirmed' AND json_extract(r.payload_json, '$.completion.at') IS NULL
       ORDER BY r.id LIMIT ?
    `, [kind, REVIEW_CANDIDATE_LIMIT])
  if (candidates.length >= REVIEW_CANDIDATE_LIMIT) {
    throw new Error('Review request auto-completion candidate scan exceeded its bound')
  }
  const rows = await filterEntitledRows(env as CloudflareEnv, candidates, 'review_requests')
  let completed = 0
  for (const row of rows) {
    // The record says when it ends. Nothing here needs a duration to guess with.
    if (Date.now() < Date.parse(row.ends_at)) continue
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
  const candidates = await queryAll<SendDueRow>(db, `
      SELECT r.id, r.organization_id, r.site_id, r.kind AS booking_type
        FROM requests r JOIN customers c ON c.id = r.customer_id
        JOIN (
          SELECT request_id, status FROM bookings
          UNION ALL
          SELECT request_id, status FROM reservations
        ) record ON record.request_id = r.id
       WHERE r.kind IN ('reservation', 'booking') AND record.status = 'completed'
         AND json_extract(r.payload_json, '$.completion.at') IS NOT NULL
         AND json_extract(r.payload_json, '$.review.submitted_at') IS NULL
         AND c.review_request_opted_out_at IS NULL
         AND ${kind === 'first'
           ? "json_extract(r.payload_json, '$.review.request_sent_at') IS NULL AND datetime(json_extract(r.payload_json, '$.completion.at')) <= datetime('now', CASE r.kind WHEN 'reservation' THEN ? ELSE ? END)"
           : "json_extract(r.payload_json, '$.review.request_sent_at') IS NOT NULL AND json_extract(r.payload_json, '$.review.reminder_sent_at') IS NULL AND datetime(json_extract(r.payload_json, '$.review.request_sent_at')) <= datetime('now', CASE r.kind WHEN 'reservation' THEN ? ELSE ? END)"}
       ORDER BY booking_type, r.id LIMIT ?
    `, [reservationDelay, experienceDelay, REVIEW_CANDIDATE_LIMIT])
  if (candidates.length >= REVIEW_CANDIDATE_LIMIT) {
    throw new Error('Review request delivery candidate scan exceeded its bound')
  }
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
