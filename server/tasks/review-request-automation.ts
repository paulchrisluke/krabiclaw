import type { D1Database } from '@cloudflare/workers-types'
import { queryAll } from '~/server/db'
import { resolveLocationTimezone } from '~/server/utils/site-config'
import { markBookingCompleted, type ReviewBookingType } from '~/server/utils/review-requests'
import { sendReviewRequestForBooking } from '~/server/utils/review-request-delivery'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { collectScheduledPaidRows } from '~/server/utils/scheduled-billing-access'
import { getGuestThreadBySubmission } from '~/server/domain/guest-threads/repository'
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
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
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
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
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
  experience_bookings_completed?: number
  first_sent: number
  reminders_sent: number
  failed: number
  skipped?: string
}

function localComparableMs(date: string, time: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const [hour, minute] = time.split(':').map(Number) as [number, number]
  return Date.UTC(year, month - 1, day, hour, minute)
}

function nowComparableMs(timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return localComparableMs(`${get('year')}-${get('month')}-${get('day')}`, `${get('hour')}:${get('minute')}`)
}

async function autoCompleteReservations(db: D1Database, env: ApiRecord): Promise<number> {
  const rows = await collectScheduledPaidRows((limit, offset) => queryAll<AutoCompleteRow>(db, `
      SELECT rs.id, rs.organization_id, rs.site_id, rs.location_id,
             rs.date AS booking_date, rs.time AS time_slot, NULL AS duration_minutes,
             ob.stripe_customer_id, ob.stripe_subscription_id, ob.access_plan,
             ob.access_expires_at, ob.payment_status, ob.paid_through, ob.past_due_since, ob.updated_at
        FROM reservation_submissions rs
        INNER JOIN organization_billing ob
          ON ob.organization_id = rs.organization_id
         AND ob.access_plan = 'growth'
       WHERE rs.status = 'confirmed'
         AND rs.completed_at IS NULL
       ORDER BY rs.id
       LIMIT ? OFFSET ?
    `, [limit, offset]), 'review_requests')

  let completed = 0
  for (const row of rows) {
    const timezone = await resolveLocationTimezone(db, row.organization_id, row.site_id, row.location_id)
    const dueAt = localComparableMs(row.booking_date, row.time_slot) + 3 * 3_600_000
    if (nowComparableMs(timezone) >= dueAt) {
      if (await markBookingCompleted(db, 'reservation', row.id, 'auto')) {
        completed += 1
        const thread = await getGuestThreadBySubmission(db, 'reservation', row.id)
        if (thread) {
          await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
        }
      }
    }
  }
  return completed
}

async function autoCompleteExperienceBookings(db: D1Database, env: ApiRecord): Promise<number> {
  const rows = await collectScheduledPaidRows((limit, offset) => queryAll<AutoCompleteRow>(db, `
      SELECT eb.id, eb.organization_id, eb.site_id, eb.location_id,
             eb.booking_date, eb.time_slot, e.duration_minutes,
             ob.stripe_customer_id, ob.stripe_subscription_id, ob.access_plan,
             ob.access_expires_at, ob.payment_status, ob.paid_through, ob.past_due_since, ob.updated_at
        FROM experience_bookings eb
        JOIN experiences e ON e.id = eb.experience_id
        INNER JOIN organization_billing ob
          ON ob.organization_id = eb.organization_id
         AND ob.access_plan = 'growth'
       WHERE eb.status = 'confirmed'
         AND eb.completed_at IS NULL
       ORDER BY eb.id
       LIMIT ? OFFSET ?
    `, [limit, offset]), 'review_requests')

  let completed = 0
  for (const row of rows) {
    const timezone = await resolveLocationTimezone(db, row.organization_id, row.site_id, row.location_id)
    const durationMs = (row.duration_minutes ?? 360) * 60_000
    const dueAt = localComparableMs(row.booking_date, row.time_slot) + durationMs
    if (nowComparableMs(timezone) >= dueAt) {
      if (await markBookingCompleted(db, 'experience_booking', row.id, 'auto')) {
        completed += 1
        const thread = await getGuestThreadBySubmission(db, 'experience_booking', row.id)
        if (thread) {
          await publishGuestInboxThreadEvent(env, db, { threadId: thread.id, type: 'thread.changed' })
        }
      }
    }
  }
  return completed
}

async function sendDue(db: D1Database, env: ApiRecord, kind: 'first' | 'reminder'): Promise<{ sent: number; failed: number }> {
  const reservationDelay = kind === 'first' ? '-2 hours' : '-5 days'
  const experienceDelay = kind === 'first' ? '-24 hours' : '-5 days'
  const rows = await collectScheduledPaidRows((limit, offset) => queryAll<SendDueRow>(db, `
      SELECT * FROM (
        SELECT rs.id, rs.organization_id, rs.site_id, 'reservation' AS booking_type,
               ob.stripe_customer_id, ob.stripe_subscription_id, ob.access_plan,
               ob.access_expires_at, ob.payment_status, ob.paid_through, ob.past_due_since, ob.updated_at
          FROM reservation_submissions rs
          JOIN customers c ON c.id = rs.customer_id
          INNER JOIN organization_billing ob
            ON ob.organization_id = rs.organization_id
           AND ob.access_plan = 'growth'
         WHERE rs.status = 'completed'
           AND rs.completed_at IS NOT NULL
           AND rs.review_submitted_at IS NULL
           AND c.review_request_opted_out_at IS NULL
           AND ${kind === 'first' ? "rs.review_request_sent_at IS NULL AND rs.completed_at <= datetime('now', ?)" : "rs.review_request_sent_at IS NOT NULL AND rs.review_reminder_sent_at IS NULL AND rs.review_request_sent_at <= datetime('now', ?)"}
        UNION ALL
        SELECT eb.id, eb.organization_id, eb.site_id, 'experience_booking' AS booking_type,
               ob.stripe_customer_id, ob.stripe_subscription_id, ob.access_plan,
               ob.access_expires_at, ob.payment_status, ob.paid_through, ob.past_due_since, ob.updated_at
          FROM experience_bookings eb
          JOIN customers c ON c.id = eb.customer_id
          INNER JOIN organization_billing ob
            ON ob.organization_id = eb.organization_id
           AND ob.access_plan = 'growth'
         WHERE eb.status = 'confirmed'
           AND eb.completed_at IS NOT NULL
           AND eb.review_submitted_at IS NULL
           AND c.review_request_opted_out_at IS NULL
           AND ${kind === 'first' ? "eb.review_request_sent_at IS NULL AND eb.completed_at <= datetime('now', ?)" : "eb.review_request_sent_at IS NOT NULL AND eb.review_reminder_sent_at IS NULL AND eb.review_request_sent_at <= datetime('now', ?)"}
      ) AS candidates
      ORDER BY booking_type, id
      LIMIT ? OFFSET ?
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

    const reservationsCompleted = await autoCompleteReservations(db, env)
    const experiencesCompleted = await autoCompleteExperienceBookings(db, env)
    const first = await sendDue(db, env, 'first')
    const reminders = await sendDue(db, env, 'reminder')

    return {
      result: {
        completed: reservationsCompleted + experiencesCompleted,
        reservations_completed: reservationsCompleted,
        experience_bookings_completed: experiencesCompleted,
        first_sent: first.sent,
        reminders_sent: reminders.sent,
        failed: first.failed + reminders.failed,
      },
    }
  },
})
