import { createHmac, timingSafeEqual } from 'node:crypto'
import { HTTPError } from 'nitro'
import { z } from 'zod'
import { executeBatch, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { getReservationSlotAvailability } from '~/server/utils/reservations'
import { getExperienceById, getSlotAvailability } from '~/server/utils/experiences'
import { resolveLocationTimezone, isTimeSlotInPast } from '~/server/utils/site-config'
import { assertResourceAccess, resolveOrganizationMembership } from '~/server/utils/member-access'
import { resolveBookingPresentation } from '~/utils/booking-presentation'
import type { CloudflareEnv } from '~/server/utils/auth'
import { notifyBookingChangeOwner } from '~/server/utils/notifications'
import { appendEntry, findEntryByDedupeKey, getEntryById } from './entries'
import { createDeliveryReceipt, deliverGuestThreadEmail } from './deliveries'
import { ensureGuestThread, getGuestThreadById, updateThreadProjection } from './repository'
import { getAdapter } from './adapters/registry'
import type { GuestThreadRow } from './types'

/**
 * Guest-facing copy uses the tenant's own word for the booking, resolved from
 * the same table the dashboard reads. Deriving it here from submission_type
 * alone told a professional-services client's guest about their "booking" while
 * every screen their host saw said consultation.
 */
async function bookingNoun(db: DbClient, thread: Pick<GuestThreadRow, 'site_id' | 'submission_type'>): Promise<string> {
	const site = await queryFirst<{ vertical: string }>(db, 'SELECT vertical FROM sites WHERE id = ? LIMIT 1', [thread.site_id])
	const kind = thread.submission_type === 'reservation' ? 'reservation' : 'experience_booking'
	return resolveBookingPresentation(kind, site?.vertical).noun
}

const fieldsSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }),
  bookingTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(99),
  locationId: z.string().min(1),
})
const requestSchema = fieldsSchema.extend({ expectedUpdatedAt: z.string().min(1) })
const proposalSchema = z.object({ before: fieldsSchema, after: fieldsSchema, updatedAt: z.string(), locationTitle: z.string(), originalLocationTitle: z.string() })
type Fields = z.infer<typeof fieldsSchema>
type Source = Fields & { updatedAt: string; status: string; experienceId: string | null; completedAt: string | null }
type ChangeEnv = CloudflareEnv

async function sourceSummary(db: DbClient, thread: GuestThreadRow) {
  const adapter = getAdapter(thread.submission_type)
  const source = await adapter.loadSource({ db }, thread.submission_id)
  if (!source) throw new HTTPError({ statusCode: 404, message: 'Reservation or booking not found' })
  return adapter.summarize(source)
}

function sourceColumns(type: string) {
  if (type === 'reservation') return { table: 'reservation_submissions', date: 'date', time: 'time', guests: 'guests' }
  if (type === 'experience_booking') return { table: 'experience_bookings', date: 'booking_date', time: 'time_slot', guests: 'party_size' }
  throw new HTTPError({ statusCode: 400, message: 'This conversation is not a reservation or booking' })
}

async function loadSource(db: DbClient, thread: GuestThreadRow): Promise<Source> {
  const c = sourceColumns(thread.submission_type)
  const row = await queryFirst<Source>(db, `SELECT ${c.date} AS bookingDate, substr(${c.time}, 1, 5) AS bookingTime,
    CAST(${c.guests} AS INTEGER) AS partySize, location_id AS locationId, updated_at AS updatedAt, status,
    ${thread.submission_type === 'reservation' ? 'NULL' : 'experience_id'} AS experienceId,
    ${thread.submission_type === 'reservation' ? 'NULL' : 'completed_at'} AS completedAt
    FROM ${c.table} WHERE id = ? AND site_id = ? AND organization_id = ?`, [thread.submission_id, thread.site_id, thread.organization_id])
  if (!row) throw new HTTPError({ statusCode: 404, message: 'Reservation or booking not found' })
  return row
}

async function validateDestination(db: DbClient, thread: GuestThreadRow, before: Source, after: Fields) {
  const location = await queryFirst<{ id: string; title: string; timezone: string | null; max_capacity: number | null; opening_hours: string | null }>(db,
    `SELECT id, title, timezone, max_capacity, opening_hours FROM business_locations WHERE id = ? AND site_id = ? AND organization_id = ?`,
    [after.locationId, thread.site_id, thread.organization_id])
  if (!location) throw new HTTPError({ statusCode: 400, message: 'Choose a location belonging to this site' })
  const timezone = await resolveLocationTimezone(db, thread.organization_id, thread.site_id, location.id)
  if (isTimeSlotInPast(after.bookingDate, after.bookingTime, timezone)) throw new HTTPError({ statusCode: 409, message: 'Choose a future time' })
  let slots
  if (thread.submission_type === 'reservation') {
    slots = await getReservationSlotAvailability(db, thread.site_id, { ...location, opening_hours: location.opening_hours ? JSON.parse(location.opening_hours) : null }, after.bookingDate, timezone)
  } else {
    const experience = before.experienceId ? await getExperienceById(db, thread.site_id, before.experienceId) : null
    if (!experience || experience.location_id !== after.locationId) throw new HTTPError({ statusCode: 409, message: 'This experience is only offered at its configured location' })
    slots = await getSlotAvailability(db, thread.site_id, experience, after.bookingDate, timezone)
  }
  const slot = slots.find(item => item.time_slot === after.bookingTime)
  const sameSlot = before.locationId === after.locationId && before.bookingDate === after.bookingDate && before.bookingTime === after.bookingTime
  if (!slot || slot.is_closed || (slot.remaining !== null && slot.remaining + (sameSlot ? before.partySize : 0) < after.partySize)) {
    throw new HTTPError({ statusCode: 409, message: 'The requested time or guest count is no longer available' })
  }
  return { ...location, capacity: slot.capacity }
}

function linkToken(env: ChangeEnv, threadId: string, requestId: string) {
  if (!env.EMAIL_REPLY_SECRET) throw new HTTPError({ statusCode: 503, message: 'Guest email signing is not configured' })
  return createHmac('sha256', env.EMAIL_REPLY_SECRET).update(`booking-change:v1:${threadId}:${requestId}`).digest('hex')
}

async function deliverEmail(db: DbClient, env: ChangeEnv, thread: GuestThreadRow, entryId: string, subject: string, body: string, status: 'requested' | 'accepted' | 'declined', proposal: z.infer<typeof proposalSchema>, noun: string) {
  const summary = await sourceSummary(db, thread)
  if (!summary.guestEmail) throw new HTTPError({ statusCode: 400, message: 'Guest email is required' })
  const site = await queryFirst<{ brand_name: string }>(db, 'SELECT brand_name FROM sites WHERE id = ?', [thread.site_id])
  if (!site?.brand_name) throw new HTTPError({ statusCode: 409, message: 'Site name is not configured' })
  const delivery = await createDeliveryReceipt(db, {
    entryId,
    channel: 'email',
    provider: env.EMAIL_DELIVERY_MODE === 'provider' ? 'resend' : 'log_only',
    purpose: 'status_update',
    idempotencyKey: `booking-change:${entryId}`,
  })
  const sent = await deliverGuestThreadEmail(db, {
    delivery,
    env,
    to: summary.guestEmail,
    fromName: site.brand_name,
    subject,
    body,
    submissionType: thread.submission_type,
    submissionId: thread.submission_id,
  })
  if (sent.status === 'failed') throw new HTTPError({ statusCode: 502, message: sent.error || 'Guest email could not be sent' })
  if (sent.status === 'unknown') throw new HTTPError({ statusCode: 504, message: sent.error || 'Guest email outcome is unknown' })
  await notifyBookingChangeOwner(env, db, {
    organizationId: thread.organization_id, siteId: thread.site_id, siteName: site.brand_name,
    locationId: status === 'accepted' ? proposal.after.locationId : proposal.before.locationId,
    threadId: thread.id, submissionType: thread.submission_type as 'reservation' | 'experience_booking', submissionId: thread.submission_id, sourceEntryId: entryId,
    guestName: summary.guestName, guestEmail: summary.guestEmail, status, noun,
    date: proposal.after.bookingDate, time: proposal.after.bookingTime, guests: proposal.after.partySize, locationTitle: proposal.locationTitle,
  })
}

/** A proposal is an immutable fact in the existing conversation, not a second booking record. */
export async function requestBookingChange(db: DbClient, env: CloudflareEnv, thread: GuestThreadRow, actorUserId: string, body: unknown, idempotencyKey: string) {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) throw new HTTPError({ statusCode: 400, message: 'Valid location, date, time, guest count, and latest reservation details are required' })
  const after = fieldsSchema.parse(parsed.data)
  const before = await loadSource(db, thread)
  const summary = await sourceSummary(db, thread)
  if (before.completedAt || !['new', 'pending', 'confirmed'].includes(before.status)) throw new HTTPError({ statusCode: 409, message: 'This reservation or booking can no longer be changed' })
  const membership = await resolveOrganizationMembership(env, { organizationId: thread.organization_id, userId: actorUserId })
  if (!membership) throw new HTTPError({ statusCode: 403, message: 'Organization access required' })
  for (const locationId of new Set([before.locationId, after.locationId])) {
    await assertResourceAccess(db, { env, memberId: membership.memberId, role: membership.role, organizationId: thread.organization_id, siteId: thread.site_id, resourceLocationId: locationId })
  }
  const externalId = `booking-change-request:${thread.id}:${idempotencyKey}`
  let entry = await findEntryByDedupeKey(db, externalId)
  if (entry) {
    const previous = proposalSchema.parse(JSON.parse(entry.payload_json || '{}'))
    if (JSON.stringify(previous.after) !== JSON.stringify(after) || previous.updatedAt !== parsed.data.expectedUpdatedAt) throw new HTTPError({ statusCode: 409, message: 'Request key was reused for different changes' })
  } else {
    if (before.updatedAt !== parsed.data.expectedUpdatedAt) throw new HTTPError({ statusCode: 409, message: 'The reservation changed. Reload before sending a request.' })
    if (JSON.stringify(fieldsSchema.parse(before)) === JSON.stringify(after)) throw new HTTPError({ statusCode: 400, message: 'Choose at least one change' })
    const location = await validateDestination(db, thread, before, after)
    const original = await queryFirst<{ title: string }>(db, 'SELECT title FROM business_locations WHERE id = ? AND site_id = ?', [before.locationId, thread.site_id])
    // Validate delivery configuration before persisting a proposal.
    linkToken(env, thread.id, 'configuration-check')
    if (!summary.guestEmail || !env.NUXT_PUBLIC_PLATFORM_DOMAIN) throw new HTTPError({ statusCode: 503, message: 'Guest email delivery is not configured' })
    entry = await appendEntry(db, { threadId: thread.id, kind: 'operation', actorKind: 'member', actorUserId,
      eventName: 'booking_change.requested', dedupeKey: externalId, body: `Requested ${after.bookingDate} at ${after.bookingTime} for ${after.partySize} guests at ${location.title}.`,
      payloadJson: { before: fieldsSchema.parse(before), after, updatedAt: before.updatedAt, locationTitle: location.title, originalLocationTitle: original?.title || location.title },
    })
  }
  const noun = await bookingNoun(db, thread)
  const proposal = proposalSchema.parse(JSON.parse(entry.payload_json || '{}'))
  const url = new URL(`/booking-changes/${thread.id}/${entry.id}`, env.NUXT_PUBLIC_PLATFORM_DOMAIN)
  url.hash = linkToken(env, thread.id, entry.id)
  await deliverEmail(db, env, thread, entry.id, `Please review changes to your ${noun}`,
    `Hi ${summary.guestName},\n\nYour host has requested changes to your ${noun}:\nLocation: ${proposal.locationTitle}\nDate: ${proposal.after.bookingDate}\nTime: ${proposal.after.bookingTime}\nGuests: ${proposal.after.partySize}\n\nReview and accept or decline: ${url.href}\n\nYour ${noun} stays unchanged until you accept. This link expires in 7 days. You can also reply to this email to talk with your host.`, 'requested', proposal, noun)
  await updateThreadProjection(db, thread.id, { conversationState: 'waiting_on_guest' })
}

/** GET only reads the immutable proposal. POST records one idempotent guest decision. */
export async function respondToBookingChange(db: DbClient, env: ChangeEnv, input: { threadId: string; requestId: string; token: string; decision?: 'accept' | 'decline' }) {
  const expected = linkToken(env, input.threadId, input.requestId)
  if (!/^[a-f0-9]{64}$/.test(input.token) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(input.token, 'hex'))) throw new HTTPError({ statusCode: 404, message: 'Change request not found' })
  const entry = await getEntryById(db, input.requestId)
  if (!entry || entry.thread_id !== input.threadId || entry.event_name !== 'booking_change.requested') throw new HTTPError({ statusCode: 404, message: 'Change request not found' })
  const thread = await getGuestThreadById(db, entry.thread_id)
  if (!thread) throw new HTTPError({ statusCode: 404, message: 'Change request not found' })
  const proposal = proposalSchema.parse(JSON.parse(entry.payload_json || '{}'))
  const resultId = `booking-change-decision:${entry.id}`
  let result = await findEntryByDedupeKey(db, resultId)
  if (!result && Date.now() > Date.parse(entry.occurred_at) + 7 * 86400_000) throw new HTTPError({ statusCode: 410, message: 'This change request has expired' })
  const current = await loadSource(db, thread)
  if (!result && current.updatedAt !== proposal.updatedAt) throw new HTTPError({ statusCode: 409, message: 'This reservation has changed since the request was sent. Ask your host for a new request.' })
  if (!result && input.decision) {
    if (current.completedAt || !['new', 'pending', 'confirmed'].includes(current.status)) throw new HTTPError({ statusCode: 409, message: 'This reservation or booking can no longer be changed' })
    const destination = input.decision === 'accept' ? await validateDestination(db, thread, current, proposal.after) : null
    const id = crypto.randomUUID()
    const c = sourceColumns(thread.submission_type)
    const condition = { sql: `source.id = ? AND source.site_id = ? AND source.updated_at = ? AND source.status IN ('new', 'pending', 'confirmed') ${thread.submission_type === 'experience_booking' ? 'AND source.completed_at IS NULL' : ''}`, params: [thread.submission_id, thread.site_id, proposal.updatedAt] as unknown[] }
    // Claim capacity in the same atomic statement as acceptance, just as public booking does.
    // Exclude this reservation rather than adding its current party back to a stale read.
    if (destination?.capacity != null) {
      const reservation = thread.submission_type === 'reservation'
      condition.sql += ` AND (SELECT COALESCE(SUM(${reservation ? "CAST(REPLACE(occupied.guests, '+', '') AS INTEGER)" : 'occupied.party_size'}), 0) FROM ${c.table} occupied
        WHERE occupied.site_id = ? AND occupied.${reservation ? 'location_id' : 'experience_id'} = ? AND occupied.${c.date} = ? AND occupied.${c.time} = ? AND occupied.id != ?
        AND ${reservation ? "occupied.status != 'cancelled'" : "occupied.status IN ('pending', 'confirmed')"}) + ? <= ?`
      condition.params.push(thread.site_id, reservation ? proposal.after.locationId : current.experienceId, proposal.after.bookingDate, proposal.after.bookingTime, thread.submission_id, proposal.after.partySize, destination.capacity)
    }
    const now = new Date().toISOString()
    const entryInsert: BatchQuery = {
      query: `INSERT INTO guest_thread_entries
        (id, thread_id, kind, actor_kind, event_name, body, payload_json, dedupe_key, sequence, occurred_at, created_at)
        SELECT ?, ?, 'operation', 'guest', ?, ?, ?, ?,
          (SELECT COALESCE(MAX(sequence), 0) + 1 FROM guest_thread_entries WHERE thread_id = ?), ?, ?
        FROM ${c.table} source WHERE ${condition.sql}
        ON CONFLICT DO NOTHING`,
      params: [id, thread.id, `booking_change.${input.decision === 'accept' ? 'accepted' : 'declined'}`, `Guest ${input.decision === 'accept' ? 'accepted' : 'declined'} the requested changes.`, JSON.stringify({ requestId: entry.id }), resultId, thread.id, now, now, ...condition.params],
    }
    const queries: BatchQuery[] = [entryInsert]
    if (input.decision === 'accept') queries.push({ query: `UPDATE ${c.table} SET ${c.date} = ?, ${c.time} = ?, ${c.guests} = ?, location_id = ?, updated_at = ?
      WHERE id = ? AND site_id = ? AND EXISTS (SELECT 1 FROM guest_thread_entries WHERE id = ?)`, params: [proposal.after.bookingDate, proposal.after.bookingTime, thread.submission_type === 'reservation' ? String(proposal.after.partySize) : proposal.after.partySize, proposal.after.locationId, now, thread.submission_id, thread.site_id, id] })
    await executeBatch(db, queries, { operation: 'respond to booking change' })
    result = await findEntryByDedupeKey(db, resultId)
    if (!result) throw new HTTPError({ statusCode: 409, message: 'This reservation changed or is no longer available' })
  }
  // Resolved once and returned, so the guest-facing page names the booking with
  // the same word as the email it arrived from.
  const noun = await bookingNoun(db, thread)
  const summary = await sourceSummary(db, thread)
  if (result && input.decision) {
    const accepted = result.event_name === 'booking_change.accepted'
    await deliverEmail(db, env, thread, result.id, `Your ${noun} change was ${accepted ? 'accepted' : 'declined'}`,
      accepted ? `Your changes are confirmed: ${proposal.after.bookingDate} at ${proposal.after.bookingTime} for ${proposal.after.partySize} guests at ${proposal.locationTitle}.` : `You declined the requested changes. Your original ${noun} remains unchanged.`, accepted ? 'accepted' : 'declined', proposal, noun)
    await ensureGuestThread(db, getAdapter(thread.submission_type), thread.submission_id)
    await updateThreadProjection(db, thread.id, { conversationState: 'resolved' })
  }
  return { type: thread.submission_type, noun, guestName: summary.guestName, before: proposal.before, after: proposal.after, locationTitle: proposal.locationTitle,
    originalLocationTitle: proposal.originalLocationTitle, status: result ? result.event_name === 'booking_change.accepted' ? 'accepted' : 'declined' : 'pending' }
}
