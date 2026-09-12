import { getGuestRequest } from '~/server/domain/requests'
import type { H3Event } from 'nitro'
import { HTTPError } from 'nitro'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertResourceAccess, listAccessibleLocationIds } from '~/server/utils/member-access'
import { getLocationReservationConfig, reservationPolicySummarySource, renderBookingPolicySummary, type RenderedBookingPolicySummary } from '~/server/utils/reservations'
import { loadPublicSocialMedia, type PublicSocialMedia } from '~/server/utils/public-social-image'
import { localPartsAt } from '~/utils/timezone'
import { appendEntry, getEntryById, GuestThreadEntryDedupeConflictError } from '~/server/domain/guest-threads/entries'
import { requestBookingChange } from '~/server/domain/guest-threads/booking-changes'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { resolveLocationTimezone } from '~/server/utils/site-config'

export type DashboardBookingType = 'reservation' | 'booking'

interface BookingRow {
  id: string
  organization_id: string
  site_id: string
  site_slug: string
  site_name: string
  vertical: string
  location_id: string
  location_slug: string
  location_title: string
  guest_name: string
  guest_email: string
  guest_phone: string | null
  guest_image_url: string | null
  party_size: number
  /** The occurrence itself, in its own zone: one instant, not a date and a time. */
  starts_at: string
  timezone: string
  status: string
  requests: string | null
  experience_id: string | null
  experience_title: string | null
  session_id: string | null
  request_id: string | null
  created_at: string
  updated_at: string
}

export interface DashboardBookingNote {
  id: string
  revisionId: string
  body: string
  createdAt: string
}

export interface DashboardBookingDetails {
  id: string
  type: DashboardBookingType
  siteId: string
  siteSlug: string
  siteName: string
  vertical: string
  locationId: string
  locationSlug: string
  locationTitle: string
  resourceTitle: string
  resourceImageUrl: string | null
  guestName: string
  guestEmail: string
  guestPhone: string | null
  guestImageUrl: string | null
  partySize: number
  bookingDate: string
  bookingTime: string
  timeZone: string
  status: string
  requests: string | null
  experienceId: string | null
  /**
   * The session a booking holds seats in. Null for a reservation, which has no
   * occurrence row. A change to a booking names the session it moves to, so the
   * screen has to know which one it is on now.
   */
  sessionId: string | null
  threadId: string | null
  createdAt: string
  updatedAt: string
  policy: RenderedBookingPolicySummary | null
  notes: DashboardBookingNote[]
  locations: Array<{ id: string; title: string; imageUrl: string | null }>
}

interface BookingAccessContext {
  env: Awaited<ReturnType<typeof getDashboardContext>>['env']
  db: DbClient
  userId: string
  organization: NonNullable<Awaited<ReturnType<typeof getDashboardContext>>['organization']>
}



async function bookingContext(event: H3Event, organizationSlug?: string | null): Promise<BookingAccessContext> {
  const context = await getDashboardContext(event, {
    requireSite: false,
    organizationSlug,
    pathname: '/api/dashboard/bookings/detail',
  })
  if (!context.organization) throw new HTTPError({ statusCode: 404, message: 'Organization not found' })
  return {
    env: context.env,
    db: context.db,
    userId: context.userId,
    organization: context.organization,
  }
}

async function loadBookingRow(
  db: DbClient,
  organizationId: string,
  type: DashboardBookingType,
  bookingId: string,
): Promise<BookingRow | null> {
  // When, for how many and against what all live on the record the thread
  // refers to — a reservation or a booking — not on the thread. The thread
  // carries the conversation and the guest.
  return queryFirst<BookingRow>(db, `SELECT r.id, r.organization_id, r.site_id, s.subdomain AS site_slug, s.brand_name AS site_name, s.vertical,
    record.location_id, l.slug AS location_slug, l.title AS location_title,
    json_extract(r.payload_json, '$.guest.name') AS guest_name, json_extract(r.payload_json, '$.guest.email') AS guest_email, json_extract(r.payload_json, '$.guest.phone') AS guest_phone,
    NULL AS guest_image_url, record.party_size, record.starts_at, record.timezone, record.status, json_extract(r.payload_json, '$.notes') AS requests,
    record.product_id AS experience_id, record.product_name AS experience_title, record.product_session_id AS session_id,
    r.id AS request_id, r.created_at, r.updated_at
    FROM requests r
    JOIN sites s ON s.id = r.site_id
    JOIN (
      SELECT b.request_id, b.status, b.party_size, ps.starts_at, ps.timezone, ps.location_id, b.product_id, p.name AS product_name, ps.id AS product_session_id
        FROM bookings b JOIN product_sessions ps ON ps.id = b.product_session_id JOIN products p ON p.id = b.product_id
      UNION ALL
      SELECT res.request_id, res.status, res.party_size, res.starts_at, res.timezone, res.location_id, NULL, NULL, NULL FROM reservations res
    ) record ON record.request_id = r.id
    JOIN business_locations l ON l.id = record.location_id
    WHERE r.id = ? AND r.organization_id = ? AND r.kind = ?`, [bookingId, organizationId, type])
}

async function assertBookingAccess(context: BookingAccessContext, row: BookingRow) {
  await assertResourceAccess(context.db, {
    env: context.env,
    memberId: context.organization.memberId,
    role: context.organization.role,
    organizationId: context.organization.id,
    siteId: row.site_id,
    resourceLocationId: row.location_id,
  })
}

function localDateOf(row: Pick<BookingRow, 'starts_at' | 'timezone'>): string {
  const parts = localPartsAt(new Date(row.starts_at), row.timezone)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function localTimeOf(row: Pick<BookingRow, 'starts_at' | 'timezone'>): string {
  const parts = localPartsAt(new Date(row.starts_at), row.timezone)
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

function mediaImage(media: PublicSocialMedia | undefined): string | null {
  const placed = media?.media.find(item => item.kind !== 'video' && ['hero', 'gallery'].includes(item.slot))
  return placed?.thumbnail_url || placed?.public_url || media?.social_image?.url || null
}

async function loadResourceImage(db: DbClient, row: BookingRow, type: DashboardBookingType) {
  if (type === 'booking' && row.experience_id) {
    const experience = await loadPublicSocialMedia(db, row.site_id, 'product', [row.experience_id])
    const image = mediaImage(experience.get(row.experience_id))
    if (image) return image
  }
  const location = await loadPublicSocialMedia(db, row.site_id, 'business_location', [row.location_id])
  return mediaImage(location.get(row.location_id))
}

async function listInternalNotes(db: DbClient, threadId: string | null): Promise<DashboardBookingNote[]> {
  if (!threadId) return []
  const rows = await queryAll<{ id: string; revisionId: string; body: string; occurred_at: string }>(db, `
    SELECT note_id AS id, id AS revisionId, body, occurred_at FROM (
      SELECT *, COALESCE(json_extract(payload_json, '$.noteId'), id) AS note_id,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(json_extract(payload_json, '$.noteId'), id) ORDER BY sequence DESC) AS revision
      FROM activity_entries WHERE request_id = ? AND kind = 'operation'
        AND event_name IN ('internal_note.added', 'internal_note.updated') AND body IS NOT NULL
    ) WHERE revision = 1 ORDER BY sequence DESC
  `, [threadId])
  return rows.map(note => ({ id: note.id, revisionId: note.revisionId, body: note.body, createdAt: note.occurred_at }))
}

export async function loadDashboardBookingDetails(
  event: H3Event,
  input: { type: DashboardBookingType; bookingId: string; organizationSlug?: string | null },
): Promise<DashboardBookingDetails> {
  const context = await bookingContext(event, input.organizationSlug)
  const row = await loadBookingRow(context.db, context.organization.id, input.type, input.bookingId)
  if (!row) throw new HTTPError({ statusCode: 404, message: 'Booking not found' })
  await assertBookingAccess(context, row)

  const allowedLocationIds = await listAccessibleLocationIds(context.db, { env: context.env, memberId: context.organization.memberId, role: context.organization.role, organizationId: context.organization.id, siteId: row.site_id })
  const locations = await queryAll<{ id: string; title: string }>(context.db, 'SELECT id, title FROM business_locations WHERE organization_id = ? AND site_id = ? ORDER BY title', [row.organization_id, row.site_id])
  const visibleLocations = locations.filter(location => (allowedLocationIds === null || allowedLocationIds.includes(location.id)) && (input.type === 'reservation' || location.id === row.location_id))
  const locationMedia = await loadPublicSocialMedia(context.db, row.site_id, 'business_location', visibleLocations.map(location => location.id))

  const [resourceImageUrl, resolvedPolicy, notes, timeZone] = await Promise.all([
    loadResourceImage(context.db, row, input.type),
    // A reservation's terms are its location's typed policy. A booking's are
    // the product's own attributes, which travel with the product — there is
    // no site-level policy to merge underneath either.
    input.type === 'reservation' && row.location_id
      ? getLocationReservationConfig(context.db, { organizationId: row.organization_id, locationId: row.location_id })
      : Promise.resolve(null),
    listInternalNotes(context.db, row.request_id),
    resolveLocationTimezone(context.db, row.organization_id, row.site_id, row.location_id),
  ])

  return {
    id: row.id,
    type: input.type,
    siteId: row.site_id,
    siteSlug: row.site_slug,
    siteName: row.site_name,
    vertical: row.vertical,
    locationId: row.location_id,
    locationSlug: row.location_slug,
    locationTitle: row.location_title,
    resourceTitle: row.experience_title || row.location_title,
    resourceImageUrl,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    // Customer records do not expose an avatar. Never bypass Better Auth to read one.
    guestImageUrl: row.guest_image_url,
    partySize: row.party_size,
    // The screen shows a local date and time; the record holds one instant and
    // the zone it belongs to, so these are read off it rather than stored
    // alongside it and kept in step.
    bookingDate: localDateOf(row),
    bookingTime: localTimeOf(row),
    timeZone,
    status: row.status,
    requests: row.requests,
    experienceId: row.experience_id,
    sessionId: row.session_id,
    threadId: row.request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Null means this location states no reservation policy, which the
    // screen shows as such rather than inventing default terms.
    policy: resolvedPolicy ? renderBookingPolicySummary(reservationPolicySummarySource(resolvedPolicy)) : null,
    notes,
    locations: visibleLocations.map(location => ({ ...location, imageUrl: mediaImage(locationMedia.get(location.id)) })),
  }
}

export async function requestDashboardBookingChange(
  event: H3Event,
  input: { type: DashboardBookingType; bookingId: string; body: unknown },
): Promise<DashboardBookingDetails> {
  const context = await bookingContext(event)
  const row = await loadBookingRow(context.db, context.organization.id, input.type, input.bookingId)
  if (!row) throw new HTTPError({ statusCode: 404, message: 'Booking not found' })
  await assertBookingAccess(context, row)
  if (!input.body || typeof input.body !== 'object' || !('idempotencyKey' in input.body) || typeof input.body.idempotencyKey !== 'string' || !input.body.idempotencyKey || input.body.idempotencyKey.length > 100) throw new HTTPError({ statusCode: 400, message: 'Request key is required' })
  const threadId = row.id
  const thread = await getGuestRequest(context.db, row.id, row.site_id, input.type)
  if (!thread) throw new HTTPError({ statusCode: 404, message: 'Booking not found' })
  await requestBookingChange(context.db, context.env, thread, context.userId, input.body, input.body.idempotencyKey)
  await publishGuestInboxThreadEvent(context.env, context.db, { threadId: threadId, type: 'thread.changed' })
    .catch(error => console.warn('[booking-details] inbox publication skipped', error))
  return await loadDashboardBookingDetails(event, { type: input.type, bookingId: row.id })
}

export async function addDashboardBookingNote(
  event: H3Event,
  input: { type: DashboardBookingType; bookingId: string; body: unknown },
): Promise<DashboardBookingDetails> {
  const context = await bookingContext(event)
  const row = await loadBookingRow(context.db, context.organization.id, input.type, input.bookingId)
  if (!row) throw new HTTPError({ statusCode: 404, message: 'Booking not found' })
  await assertBookingAccess(context, row)
  if (!input.body || typeof input.body !== 'object' || Array.isArray(input.body)) {
    throw new HTTPError({ statusCode: 400, message: 'Note is required' })
  }
  const payload = input.body as Record<string, unknown>
  const note = typeof payload.note === 'string' ? payload.note.trim() : ''
  const idempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : ''
  if (!note || note.length > 2000) throw new HTTPError({ statusCode: 400, message: 'Note must be between 1 and 2000 characters' })
  if (!idempotencyKey || idempotencyKey.length > 100) throw new HTTPError({ statusCode: 400, message: 'idempotencyKey is required' })

  const threadId = row.id
  const noteId = typeof payload.noteId === 'string' ? payload.noteId : null
  const revisionId = typeof payload.revisionId === 'string' ? payload.revisionId : null
  if (noteId) {
    const original = await getEntryById(context.db, noteId)
    const revision = revisionId ? await getEntryById(context.db, revisionId) : null
    if (!original || original.request_id !== threadId || original.event_name !== 'internal_note.added' || !revision || revision.request_id !== threadId || !['internal_note.added', 'internal_note.updated'].includes(revision.event_name || '') || (revision.id !== noteId && JSON.parse(revision.payload_json || '{}').noteId !== noteId)) throw new HTTPError({ statusCode: 404, message: 'Note not found' })
  }
  await appendEntry(context.db, {
    threadId: threadId,
    kind: 'operation',
    actorKind: 'member',
    actorUserId: context.userId,
    channel: 'system',
    body: note,
    eventName: noteId ? 'internal_note.updated' : 'internal_note.added',
    payloadJson: { private: true, ...(noteId ? { noteId, revisionId, idempotencyKey } : {}) },
    dedupeKey: noteId ? `dashboard-booking-note-revision:${threadId}:${revisionId}` : `dashboard-booking-note:${threadId}:${idempotencyKey}`,
  }).catch((error: unknown) => {
    if (noteId && error instanceof GuestThreadEntryDedupeConflictError) throw new HTTPError({ statusCode: 409, message: 'This note was edited elsewhere. Reload and try again.' })
    throw error
  })
  await publishGuestInboxThreadEvent(context.env, context.db, { threadId: threadId, type: 'thread.changed' })
    .catch(error => console.warn('[booking-details] inbox publication skipped', error))
  return await loadDashboardBookingDetails(event, { type: input.type, bookingId: row.id })
}

export function isDashboardBookingType(value: string | undefined): value is DashboardBookingType {
  return value === 'reservation' || value === 'booking'
}
