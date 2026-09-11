import { z } from 'zod'
import { queryFirst, type BatchQuery, type DbClient } from '~/server/db'

/**
 * The inbox.
 *
 * A request is one conversation thread with a guest and its workflow state.
 * It is NOT the booking. It used to carry (product_id, booking_date,
 * time_slot, party_size, status) as an independently writable copy of an
 * occurrence; the occurrence is now a `product_sessions` row, the seat claim
 * a `bookings` row, and a table reservation a `reservations` row. Each of
 * those links back here through `request_id`.
 *
 * A contact thread has neither and is not forced into the booking model.
 */

const guest = z.object({ name: z.string(), email: z.string(), phone: z.string().nullable() })

/**
 * What the thread itself owns.
 *
 * `cancellation` is the emailed self-service token: the thread's capability,
 * not the booking's state. Whether the booking is cancelled is
 * `bookings.status`; `used_at` only records that this token was spent.
 * Completion and review timestamps are deliberately absent — those belong to
 * `bookings.completed_at` and the `review_requests` record.
 */
const threadPayload = z.object({
  guest,
  party_size_is_minimum: z.boolean(),
  notes: z.string().nullable(),
  ip_hash: z.string().nullable(),
  cancellation: z.object({ token_hash: z.string().nullable(), expires_at: z.string().nullable(), used_at: z.string().nullable() }),
})

const threadScope = z.object({
  id: z.string(), organization_id: z.string(), site_id: z.string(), location_id: z.string().nullable(),
  customer_id: z.string().nullable(), review_id: z.string().nullable(),
  conversation_state: z.enum(['needs_attention', 'waiting_on_guest', 'resolved']), resolved_at: z.string().nullable(),
  created_at: z.string(), updated_at: z.string(),
})

export const guestRequestSchema = z.discriminatedUnion('kind', [
  threadScope.extend({ kind: z.literal('contact'), payload: z.object({
    guest, subject: z.string().nullable(), message: z.string(), consent_at: z.string().nullable(), ip_hash: z.string().nullable(),
    // Where the message came from, when a form or ChatGPT escalation says so.
    source: z.string().nullable().optional(), route_context: z.string().nullable().optional(),
    suggested_summary: z.string().nullable().optional(), agent_metadata: z.unknown().optional(),
  }) }),
  threadScope.extend({ kind: z.literal('reservation'), payload: threadPayload.extend({ guest: guest.extend({ phone: z.string() }) }) }),
  threadScope.extend({ kind: z.literal('booking'), payload: threadPayload }),
])
export type GuestRequest = z.infer<typeof guestRequestSchema>
export type BookingRequest = Extract<GuestRequest, { kind: 'reservation' | 'booking' }>
export type GuestRequestKind = GuestRequest['kind']
export type ThreadPayload = z.infer<typeof threadPayload>

/** The operational record a thread links to, when it has one. */
export interface ThreadOperationalRecord {
  kind: 'booking' | 'reservation'
  id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  party_size: number
  starts_at: string
  ends_at: string
  timezone: string
  location_id: string | null
  product_id: string | null
  product_name: string | null
}

export function parseGuestRequest(row: Record<string, unknown>): GuestRequest {
  if (typeof row.payload_json !== 'string') throw new Error('Request payload is missing')
  return guestRequestSchema.parse({ ...row, payload: JSON.parse(row.payload_json) })
}

export async function getGuestRequest(db: DbClient, id: string, siteId?: string, kind?: GuestRequestKind): Promise<GuestRequest | null> {
  const row = await queryFirst<Record<string, unknown>>(db, `SELECT * FROM requests WHERE id = ? AND kind IN ('contact', 'reservation', 'booking')${siteId ? ' AND site_id = ?' : ''}${kind ? ' AND kind = ?' : ''}`, [id, ...(siteId ? [siteId] : []), ...(kind ? [kind] : [])])
  return row ? parseGuestRequest(row) : null
}

/**
 * Load the booking or reservation a thread refers to.
 *
 * Returns null for a contact thread, and for a booking thread whose
 * operational record was never created — which is a broken state the caller
 * must surface, never paper over with placeholder times.
 */
export async function getThreadOperationalRecord(db: DbClient, requestId: string): Promise<ThreadOperationalRecord | null> {
  return queryFirst<ThreadOperationalRecord>(db, `
    SELECT 'booking' AS kind, b.id, b.status, b.party_size, s.starts_at, s.ends_at, s.timezone,
           s.location_id, b.product_id, p.name AS product_name
      FROM bookings b
      JOIN product_sessions s ON s.id = b.product_session_id
      JOIN products p ON p.id = b.product_id
     WHERE b.request_id = ?
    UNION ALL
    SELECT 'reservation', r.id, r.status, r.party_size, r.starts_at, r.ends_at, r.timezone,
           r.location_id, NULL, NULL
      FROM reservations r
     WHERE r.request_id = ?
     LIMIT 1
  `, [requestId, requestId]) ?? null
}

export function requestInsertQueries(request: GuestRequest): [BatchQuery, BatchQuery] {
  return [{
    query: `INSERT INTO requests (id, kind, organization_id, site_id, location_id, customer_id, review_id, conversation_state, resolved_at, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [request.id, request.kind, request.organization_id, request.site_id, request.location_id, request.customer_id, request.review_id,
      request.conversation_state, request.resolved_at, JSON.stringify(request.payload), request.created_at, request.updated_at],
  }, {
    query: `INSERT INTO activity_entries (id, request_id, kind, scope_kind, actor_kind, channel, payload_json, dedupe_key, sequence, occurred_at, created_at)
      SELECT ?, id, 'submission', 'request', 'guest', 'web', json_object('kind', kind), ?, 1, created_at, created_at FROM requests WHERE id = ? AND changes() = 1`,
    params: [crypto.randomUUID(), `request:${request.id}:submission`, request.id],
  }]
}

interface GuestThreadInput { name: string; email: string; phone?: string | null; notes?: string | null; ipHash?: string | null; partySizeIsMinimum?: boolean }
export function threadPayloadForGuest(input: GuestThreadInput & { phone: string }): ThreadPayload & { guest: { phone: string } }
export function threadPayloadForGuest(input: GuestThreadInput): ThreadPayload
export function threadPayloadForGuest(input: GuestThreadInput): ThreadPayload {
  return {
    guest: { name: input.name, email: input.email, phone: input.phone ?? null },
    notes: input.notes ?? null, ip_hash: input.ipHash ?? null,
    party_size_is_minimum: input.partySizeIsMinimum ?? false,
    cancellation: { token_hash: null, expires_at: null, used_at: null },
  }
}

export function requestActions(record: ThreadOperationalRecord | null): string[] {
  if (!record || record.status === 'cancelled' || record.status === 'completed') return []
  return record.status === 'pending' ? ['confirm', 'cancel'] : ['complete', 'cancel']
}

export function requestPreview(request: GuestRequest, record: ThreadOperationalRecord | null): string {
  if (request.kind === 'contact') return request.payload.message.replace(/\s+/g, ' ').trim().slice(0, 160)
  if (request.payload.notes) return request.payload.notes.replace(/\s+/g, ' ').trim().slice(0, 160)
  // With no operational record there is nothing to summarize, and inventing a
  // date would make a broken thread look ordinary.
  if (!record) return ''
  const local = new Intl.DateTimeFormat('en-US', { timeZone: record.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.starts_at))
  return `${local} · ${record.party_size}${request.payload.party_size_is_minimum ? '+' : ''} guests`.slice(0, 160)
}

export async function requestSummary(db: DbClient, request: GuestRequest) {
  const record = await getThreadOperationalRecord(db, request.id)
  const labels = await queryFirst<{ location_title: string | null }>(db, 'SELECT title AS location_title FROM business_locations WHERE id = ?', [request.location_id])
  return {
    guestName: request.payload.guest.name, guestEmail: request.payload.guest.email, guestPhone: request.payload.guest.phone,
    organizationId: request.organization_id, siteId: request.site_id, locationId: request.location_id,
    locationTitle: labels?.location_title ?? null, productTitle: record?.product_name ?? null,
    contextLabel: requestPreview(request, record), createdAt: request.created_at,
    operationalStatus: record?.status ?? null,
  }
}

/**
 * Spend a guest's cancellation token and cancel what it refers to.
 *
 * Two writes, one batch: the token is marked used on the thread and the
 * booking or reservation moves to cancelled. Cancelling the operational
 * record is what releases the seats — the thread holds none.
 */
export async function cancelBookingRequest(db: DbClient, input: {
  id: string; siteId: string; kind: BookingRequest['kind']; tokenHash: string; now: string
}): Promise<{ request: BookingRequest; record: ThreadOperationalRecord; wasConfirmed: boolean } | null> {
  const current = await getGuestRequest(db, input.id, input.siteId, input.kind)
  if (!current || current.kind === 'contact') return null
  const record = await getThreadOperationalRecord(db, current.id)
  if (!record || !['pending', 'confirmed'].includes(record.status)) return null

  const row = await queryFirst<Record<string, unknown>>(db, `UPDATE requests SET
      payload_json = json_set(payload_json, '$.cancellation.used_at', ?), updated_at = ?
    WHERE id = ? AND site_id = ? AND kind = ?
      AND json_extract(payload_json, '$.cancellation.token_hash') = ?
      AND json_extract(payload_json, '$.cancellation.used_at') IS NULL
      AND json_extract(payload_json, '$.cancellation.expires_at') > ? RETURNING *`,
  [input.now, input.now, input.id, input.siteId, input.kind, input.tokenHash, input.now])
  if (!row) return null

  const table = record.kind === 'booking' ? 'bookings' : 'reservations'
  await queryFirst(db, `UPDATE ${table} SET status = 'cancelled', cancelled_at = ?, cancellation_reason = 'guest_cancelled', updated_at = ?
    WHERE id = ? AND status = ?`, [input.now, input.now, record.id, record.status])

  const request = parseGuestRequest(row)
  if (request.kind === 'contact') throw new Error('Cancellation returned a contact thread')
  return { request, record: { ...record, status: 'cancelled' }, wasConfirmed: record.status === 'confirmed' }
}
