import { createHmac, timingSafeEqual } from 'node:crypto'
import { HTTPError } from 'nitro'
import { z } from 'zod'
import { executeBatch, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { listSessions, sessionClaimQuery } from '~/server/utils/availability'
import { localDateTimeToInstant } from '~/utils/timezone'
import { RESERVATION_CAPACITY_CONSUMING_SQL } from '~/shared/bookings'
import { assertResourceAccess, resolveOrganizationMembership } from '~/server/utils/member-access'
import { resolveBookingPresentation, type BookingKind } from '~/utils/booking-presentation'
import type { CloudflareEnv } from '~/server/utils/auth'
import { notifyBookingChangeOwner } from '~/server/utils/notifications'
import { appendEntry, findEntryByDedupeKey, getEntryById } from './entries'
import { createDeliveryReceipt, deliverGuestThreadEmail } from './deliveries'
import { updateThreadProjection } from './repository'
import { getGuestRequest, getThreadOperationalRecord, requestSummary } from '~/server/domain/requests'
import type { GuestThreadRow } from './types'

/**
 * Guest-facing copy uses the tenant's own word for the booking, resolved from
 * the same table the dashboard reads. Deriving it here from submission_type
 * alone told a professional-services client's guest about their "booking" while
 * every screen their host saw said consultation.
 */
async function bookingNoun(db: DbClient, thread: Pick<GuestThreadRow, 'site_id' | 'kind'>): Promise<string> {
	const site = await queryFirst<{ vertical: string }>(db, 'SELECT vertical FROM sites WHERE id = ? LIMIT 1', [thread.site_id])
	const kind: BookingKind = thread.kind === 'reservation' ? 'reservation' : 'booking'
	return resolveBookingPresentation(kind, site?.vertical).noun
}

/**
 * What a change proposes.
 *
 * A booking and a reservation are different capabilities, so a change to one
 * is not a change to the other wearing different field names. A booking moves
 * to another SESSION of the same product — the occurrence is a real row, so
 * the proposal names it. A reservation has no occurrence row, so it moves to a
 * location, date and time.
 */
const bookingFieldsSchema = z.object({ kind: z.literal('booking'), sessionId: z.string().min(1), partySize: z.number().int().min(1).max(99) })
const reservationFieldsSchema = z.object({
  kind: z.literal('reservation'),
  locationId: z.string().min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }),
  bookingTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.number().int().min(1).max(99),
})
const fieldsSchema = z.discriminatedUnion('kind', [bookingFieldsSchema, reservationFieldsSchema])
const requestSchema = z.intersection(fieldsSchema, z.object({ expectedUpdatedAt: z.string().min(1) }))
const sourceSchema = z.object({
  recordKind: z.enum(['booking', 'reservation']),
  recordId: z.string(),
  status: z.string(),
  partySize: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  locationId: z.string().nullable(),
  productId: z.string().nullable(),
  partySizeIsMinimum: z.boolean(),
  notes: z.string().nullable(),
  guest: z.object({ name: z.string(), email: z.string(), phone: z.string().nullable() }),
})
const proposalSchema = z.object({
  before: sourceSchema, after: fieldsSchema, updatedAt: z.string(),
  locationTitle: z.string(), originalLocationTitle: z.string(), afterLabel: z.string(),
})
type Fields = z.infer<typeof fieldsSchema>
type Source = z.infer<typeof sourceSchema> & { updatedAt: string }
type ChangeEnv = CloudflareEnv

async function sourceSummary(db: DbClient, thread: GuestThreadRow) {
  return requestSummary(db, thread)
}

function localLabel(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant))
}

/**
 * The current state of what the thread actually refers to.
 *
 * Read from the booking or reservation, never from the thread: the thread
 * stopped holding a copy of the occurrence precisely so the two could not
 * disagree.
 */
async function loadSource(db: DbClient, thread: GuestThreadRow): Promise<Source> {
  if (thread.kind === 'contact') throw new HTTPError({ statusCode: 400, message: 'This conversation is not a reservation or booking' })
  const record = await getThreadOperationalRecord(db, thread.id)
  if (!record) throw new HTTPError({ statusCode: 409, message: 'This conversation has no booking or reservation to change' })
  const payload = thread.payload as { party_size_is_minimum: boolean; notes: string | null; guest: { name: string; email: string; phone: string | null } }
  return {
    recordKind: record.kind, recordId: record.id, status: record.status, partySize: record.party_size,
    startsAt: record.starts_at, endsAt: record.ends_at, timezone: record.timezone,
    locationId: record.location_id, productId: record.product_id,
    updatedAt: thread.updated_at, partySizeIsMinimum: payload.party_size_is_minimum, notes: payload.notes, guest: payload.guest,
  }
}

interface Destination { locationId: string | null; title: string; label: string; startsAt: string; claim?: (bookingId: string, now: string) => BatchQuery; sessionId?: string }

/**
 * Check that the proposed target can actually take this party, and return the
 * statement that claims it.
 *
 * For a booking the statement is the session claim, carrying its own capacity
 * predicate so the seat is taken atomically with the release of the old one.
 * For a reservation the slot is checked against the location's configured
 * capacity for that start time.
 */
async function validateDestination(db: DbClient, thread: GuestThreadRow, before: Source, after: Fields): Promise<Destination> {
  if (after.kind === 'booking') {
    if (before.recordKind !== 'booking' || !before.productId) throw new HTTPError({ statusCode: 409, message: 'This conversation is a reservation, not a booking' })
    const [target] = await listSessions(db, {
      organizationId: thread.organization_id, productId: before.productId,
      fromInstant: new Date().toISOString(), toInstant: new Date(Date.now() + 400 * 86_400_000).toISOString(),
    })
      .then(sessions => sessions.filter(session => session.id === after.sessionId))
    if (!target) throw new HTTPError({ statusCode: 409, message: 'That session is not open for booking' })
    const booking = await queryFirst<{ product_variant_id: string; customer_id: string | null }>(db,
      'SELECT product_variant_id, customer_id FROM bookings WHERE id = ?', [before.recordId])
    if (!booking) throw new HTTPError({ statusCode: 409, message: 'The original booking is missing' })
    const location = target.location_id
      ? await queryFirst<{ title: string }>(db, 'SELECT title FROM business_locations WHERE id = ? AND site_id = ?', [target.location_id, thread.site_id])
      : null
    return {
      locationId: target.location_id, title: location?.title ?? '', sessionId: target.id,
      startsAt: target.starts_at, label: localLabel(target.starts_at, target.timezone),
      claim: (bookingId, now) => sessionClaimQuery({
        bookingId, organizationId: thread.organization_id, siteId: thread.site_id, productId: before.productId!,
        sessionId: target.id, productVariantId: booking.product_variant_id, partySize: after.partySize,
        customerId: booking.customer_id, requestId: thread.id, now,
      }),
    }
  }

  const location = await queryFirst<{ id: string; title: string; timezone: string | null }>(db,
    'SELECT id, title, timezone FROM business_locations WHERE id = ? AND site_id = ? AND organization_id = ?',
    [after.locationId, thread.site_id, thread.organization_id])
  if (!location) throw new HTTPError({ statusCode: 400, message: 'Choose a location belonging to this site' })
  if (!location.timezone) throw new HTTPError({ statusCode: 409, message: 'Set the location timezone before changing reservations' })
  const startsAt = localDateTimeToInstant(after.bookingDate, after.bookingTime, location.timezone, 'reject').toISOString()
  const capacity = await queryFirst<{ slot_capacity: number | null }>(db,
    'SELECT slot_capacity FROM location_reservation_configs WHERE location_id = ? AND organization_id = ?', [location.id, thread.organization_id])
  if (!capacity) throw new HTTPError({ statusCode: 409, message: 'This location does not take reservations' })
  if (capacity.slot_capacity !== null) {
    const claimed = await queryFirst<{ total: number }>(db, `
      SELECT COALESCE(SUM(r.party_size), 0) AS total FROM reservations r
       WHERE r.location_id = ? AND r.starts_at = ? AND r.id <> ? AND ${RESERVATION_CAPACITY_CONSUMING_SQL}
    `, [location.id, startsAt, before.recordId])
    if ((claimed?.total ?? 0) + after.partySize > capacity.slot_capacity) {
      throw new HTTPError({ statusCode: 409, message: 'The requested time or guest count is no longer available' })
    }
  }
  return { locationId: location.id, title: location.title, startsAt, label: localLabel(startsAt, location.timezone) }
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
    submissionType: thread.kind,
    submissionId: thread.id,
  })
  if (sent.status === 'failed') throw new HTTPError({ statusCode: 502, message: sent.error || 'Guest email could not be sent' })
  if (sent.status === 'unknown') throw new HTTPError({ statusCode: 504, message: sent.error || 'Guest email outcome is unknown' })
  await notifyBookingChangeOwner(env, db, {
    organizationId: thread.organization_id, siteId: thread.site_id, siteName: site.brand_name,
    locationId: (status === 'accepted' && proposal.after.kind === 'reservation' ? proposal.after.locationId : proposal.before.locationId) ?? '',
    threadId: thread.id, submissionType: thread.kind === 'reservation' ? 'reservation' : 'booking', submissionId: thread.id, sourceEntryId: entryId,
    guestName: summary.guestName, guestEmail: summary.guestEmail, status, noun,
    whenLabel: proposal.afterLabel, guests: proposal.after.partySize, locationTitle: proposal.locationTitle,
  })
}

/** A proposal is an immutable fact in the existing conversation, not a second booking record. */
export async function requestBookingChange(db: DbClient, env: CloudflareEnv, thread: GuestThreadRow, actorUserId: string, body: unknown, idempotencyKey: string) {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) throw new HTTPError({ statusCode: 400, message: 'Valid change details and the latest booking timestamp are required' })
  const [afterInput, meta] = [parsed.data as Fields & { expectedUpdatedAt: string }, parsed.data as { expectedUpdatedAt: string }]
  const after = fieldsSchema.parse(afterInput)
  const before = await loadSource(db, thread)
  const summary = await sourceSummary(db, thread)
  if (!['pending', 'confirmed'].includes(before.status)) throw new HTTPError({ statusCode: 409, message: 'This reservation or booking can no longer be changed' })
  const membership = await resolveOrganizationMembership(env, { organizationId: thread.organization_id, userId: actorUserId })
  if (!membership) throw new HTTPError({ statusCode: 403, message: 'Organization access required' })
  // Both the current and the proposed location must be within reach, so a
  // branch editor cannot move a guest into a branch they do not manage.
  const locations = new Set([before.locationId, after.kind === 'reservation' ? after.locationId : null].filter((value): value is string => Boolean(value)))
  for (const locationId of locations) {
    await assertResourceAccess(db, { env, memberId: membership.memberId, role: membership.role, organizationId: thread.organization_id, siteId: thread.site_id, resourceLocationId: locationId })
  }
  const externalId = `booking-change-request:${thread.id}:${idempotencyKey}`
  let entry = await findEntryByDedupeKey(db, externalId)
  if (entry) {
    const previous = proposalSchema.parse(JSON.parse(entry.payload_json || '{}'))
    if (JSON.stringify(previous.after) !== JSON.stringify(after) || previous.updatedAt !== meta.expectedUpdatedAt) throw new HTTPError({ statusCode: 409, message: 'Request key was reused for different changes' })
  } else {
    if (before.updatedAt !== meta.expectedUpdatedAt) throw new HTTPError({ statusCode: 409, message: 'The reservation changed. Reload before sending a request.' })
    const destination = await validateDestination(db, thread, before, after)
    if (destination.label === localLabel(before.startsAt, before.timezone) && after.partySize === before.partySize) {
      throw new HTTPError({ statusCode: 400, message: 'Choose at least one change' })
    }
    const original = before.locationId
      ? await queryFirst<{ title: string }>(db, 'SELECT title FROM business_locations WHERE id = ? AND site_id = ?', [before.locationId, thread.site_id])
      : null
    // Validate delivery configuration before persisting a proposal.
    linkToken(env, thread.id, 'configuration-check')
    if (!summary.guestEmail || !env.NUXT_PUBLIC_PLATFORM_DOMAIN) throw new HTTPError({ statusCode: 503, message: 'Guest email delivery is not configured' })
    entry = await appendEntry(db, { threadId: thread.id, kind: 'operation', actorKind: 'member', actorUserId,
      eventName: 'booking_change.requested', dedupeKey: externalId,
      body: `Requested ${destination.label} for ${after.partySize} guests${destination.title ? ` at ${destination.title}` : ''}.`,
      payloadJson: { before: sourceSchema.parse(before), after, updatedAt: before.updatedAt,
        locationTitle: destination.title, originalLocationTitle: original?.title || destination.title, afterLabel: destination.label },
    })
  }
  const noun = await bookingNoun(db, thread)
  const proposal = proposalSchema.parse(JSON.parse(entry.payload_json || '{}'))
  const url = new URL(`/booking-changes/${thread.id}/${entry.id}`, env.NUXT_PUBLIC_PLATFORM_DOMAIN)
  url.hash = linkToken(env, thread.id, entry.id)
  await deliverEmail(db, env, thread, entry.id, `Please review changes to your ${noun}`,
    `Hi ${summary.guestName},\n\nYour host has requested changes to your ${noun}:\n${proposal.locationTitle ? `Location: ${proposal.locationTitle}\n` : ''}When: ${proposal.afterLabel}\nGuests: ${proposal.after.partySize}\n\nReview and accept or decline: ${url.href}\n\nYour ${noun} stays unchanged until you accept. This link expires in 7 days. You can also reply to this email to talk with your host.`, 'requested', proposal, noun)
  await updateThreadProjection(db, thread.id, { conversationState: 'waiting_on_guest' })
}

/** GET only reads the immutable proposal. POST records one idempotent guest decision. */
export async function respondToBookingChange(db: DbClient, env: ChangeEnv, input: { threadId: string; requestId: string; token: string; decision?: 'accept' | 'decline' }) {
  const expected = linkToken(env, input.threadId, input.requestId)
  if (!/^[a-f0-9]{64}$/.test(input.token) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(input.token, 'hex'))) throw new HTTPError({ statusCode: 404, message: 'Change request not found' })
  const entry = await getEntryById(db, input.requestId)
  if (!entry || entry.request_id !== input.threadId || entry.event_name !== 'booking_change.requested') throw new HTTPError({ statusCode: 404, message: 'Change request not found' })
  const thread = await getGuestRequest(db, entry.request_id)
  if (!thread) throw new HTTPError({ statusCode: 404, message: 'Change request not found' })
  const proposal = proposalSchema.parse(JSON.parse(entry.payload_json || '{}'))
  const resultId = `booking-change-decision:${entry.id}`
  let result = await findEntryByDedupeKey(db, resultId)
  if (!result && Date.now() > Date.parse(entry.occurred_at) + 7 * 86400_000) throw new HTTPError({ statusCode: 410, message: 'This change request has expired' })
  const current = await loadSource(db, thread as GuestThreadRow)
  if (!result && JSON.stringify(sourceSchema.parse(current)) !== JSON.stringify(proposal.before)) throw new HTTPError({ statusCode: 409, message: 'This reservation has changed since the request was sent. Ask your host for a new request.' })

  if (!result && input.decision) {
    if (!['pending', 'confirmed'].includes(current.status)) throw new HTTPError({ statusCode: 409, message: 'This reservation or booking can no longer be changed' })
    const destination = input.decision === 'accept' ? await validateDestination(db, thread as GuestThreadRow, current, proposal.after) : null
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // The decision entry is guarded on the thread still being exactly what the
    // guest was shown. Everything else in the batch depends on that row
    // existing, so a concurrent edit makes the whole decision a no-op rather
    // than half-applying it.
    const entryInsert: BatchQuery = {
      query: `INSERT INTO activity_entries
        (id, request_id, kind, scope_kind, actor_kind, event_name, body, payload_json, dedupe_key, sequence, occurred_at, created_at)
        SELECT ?, ?, 'operation', 'request', 'guest', ?, ?, ?, ?,
          (SELECT COALESCE(MAX(sequence), 0) + 1 FROM activity_entries WHERE request_id = ?), ?, ?
        FROM requests source WHERE source.id = ? AND source.site_id = ? AND source.updated_at = ?
        ON CONFLICT DO NOTHING`,
      params: [id, thread.id, `booking_change.${input.decision === 'accept' ? 'accepted' : 'declined'}`,
        `Guest ${input.decision === 'accept' ? 'accepted' : 'declined'} the requested changes.`,
        JSON.stringify({ requestId: entry.id }), resultId, thread.id, now, now,
        thread.id, thread.site_id, current.updatedAt],
    }

    const queries: BatchQuery[] = [entryInsert]
    if (destination) {
      const guard = `EXISTS (SELECT 1 FROM activity_entries WHERE id = ?)`
      if (current.recordKind === 'booking' && destination.claim) {
        // Release the old seat and take the new one in the same batch. The
        // release lands first, so the claim's capacity predicate counts it as
        // freed — a guest moving within a full class is not blocked by their
        // own seat, and a guest moving into a full one still fails.
        queries.push({
          query: `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancellation_reason = 'changed', updated_at = ?
                   WHERE id = ? AND ${guard}`,
          params: [now, now, current.recordId, id],
        })
        // request_id is unique per booking, so the old row must release it
        // before the replacement can take it.
        queries.push({ query: `UPDATE bookings SET request_id = NULL WHERE id = ? AND ${guard}`, params: [current.recordId, id] })
        queries.push(destination.claim(crypto.randomUUID(), now))
      } else {
        // The reservation keeps its length: moving a 7pm table for two to 8pm
        // does not silently change how long the table is held.
        const durationMs = Date.parse(current.endsAt) - Date.parse(current.startsAt)
        const endsAt = new Date(Date.parse(destination.startsAt) + durationMs).toISOString()
        queries.push({
          query: `UPDATE reservations SET starts_at = ?, ends_at = ?, party_size = ?, location_id = ?, updated_at = ?
                   WHERE id = ? AND ${guard}`,
          params: [destination.startsAt, endsAt, proposal.after.partySize, destination.locationId, now, current.recordId, id],
        })
      }
      queries.push({
        query: `UPDATE requests SET updated_at = ?, payload_json = json_set(payload_json, '$.party_size_is_minimum', json('false'))
                 WHERE id = ? AND site_id = ? AND ${guard}`,
        params: [now, thread.id, thread.site_id, id],
      })
    }

    await executeBatch(db, queries, { operation: 'respond to booking change' })
    result = await findEntryByDedupeKey(db, resultId)
    if (!result) throw new HTTPError({ statusCode: 409, message: 'This reservation changed or is no longer available' })
    if (destination && current.recordKind === 'booking') {
      const moved = await queryFirst<{ id: string }>(db, 'SELECT id FROM bookings WHERE request_id = ? AND status <> ?', [thread.id, 'cancelled'])
      // The claim carries its own capacity predicate, so a full session
      // simply inserts nothing. Say so rather than reporting success.
      if (!moved) throw new HTTPError({ statusCode: 409, message: 'That session filled up before the change was accepted' })
    }
  }

  // Resolved once and returned, so the guest-facing page names the booking with
  // the same word as the email it arrived from.
  const noun = await bookingNoun(db, thread as GuestThreadRow)
  const summary = await sourceSummary(db, thread as GuestThreadRow)
  if (result && input.decision) {
    const accepted = result.event_name === 'booking_change.accepted'
    await deliverEmail(db, env, thread as GuestThreadRow, result.id, `Your ${noun} change was ${accepted ? 'accepted' : 'declined'}`,
      accepted
        ? `Your changes are confirmed: ${proposal.afterLabel} for ${proposal.after.partySize} guests${proposal.locationTitle ? ` at ${proposal.locationTitle}` : ''}.`
        : `You declined the requested changes. Your original ${noun} remains unchanged.`,
      accepted ? 'accepted' : 'declined', proposal, noun)
    await updateThreadProjection(db, thread.id, { conversationState: 'resolved' })
  }
  return {
    type: thread.kind, noun, guestName: summary.guestName,
    before: { whenLabel: localLabel(proposal.before.startsAt, proposal.before.timezone), partySize: proposal.before.partySize },
    after: { whenLabel: proposal.afterLabel, partySize: proposal.after.partySize },
    locationTitle: proposal.locationTitle, originalLocationTitle: proposal.originalLocationTitle,
    status: result ? result.event_name === 'booking_change.accepted' ? 'accepted' : 'declined' : 'pending',
  }
}
