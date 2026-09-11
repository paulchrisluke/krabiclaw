import { HTTPError } from 'nitro'
import { sanitizeUrl } from '~/utils/sanitize'
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '../db/index.ts'
import { generateReservationTimes, parseOpeningHours, parseSpecialHours } from '~/shared/reservation-hours'
import { RESERVATION_CAPACITY_CONSUMING_SQL } from '~/shared/bookings'
import { isValidTimezone, localDateTimeToInstant } from '~/utils/timezone'
export { formatBookingPolicySummary as renderBookingPolicySummary } from './booking-policy-summary.ts'
export type {
  FormattedBookingPolicySummary as RenderedBookingPolicySummary,
  FormattedBookingPolicySummaryItem as RenderedBookingPolicySummaryItem,
} from './booking-policy-summary.ts'

/**
 * Location reservation policy.
 *
 * One location, one typed row. There is no site → location → experience
 * cascade any more: the old resolver merged three partial policies field by
 * field, so a single displayed rule could come from any of three places and
 * nobody could say which without re-running the merge. A location either
 * states a rule or does not state it.
 *
 * Product booking policy is not here at all. A product's cancellation terms
 * and preparation notes are typed metafields on the product, read through the
 * metafield contract like every other descriptive attribute.
 */

export interface LocationReservationConfig {
  location_id: string
  organization_id: string
  slot_capacity: number | null
  advance_notice_minutes: number | null
  minimum_guest_age: number | null
  deposit_required: boolean
  deposit_trigger_party_size: number | null
  free_cancellation_until_minutes: number | null
  reschedule_allowed: boolean
  reschedule_cutoff_minutes: number | null
  accessibility_contact_required: boolean
  additional_notes_html: string | null
  created_at: string
  updated_at: string
}

export type LocationReservationConfigPatch = Partial<Omit<LocationReservationConfig,
  'location_id' | 'organization_id' | 'created_at' | 'updated_at'>>

const NUMERIC_FIELDS = [
  'slot_capacity', 'advance_notice_minutes', 'minimum_guest_age',
  'deposit_trigger_party_size', 'free_cancellation_until_minutes', 'reschedule_cutoff_minutes',
] as const
const BOOLEAN_FIELDS = ['deposit_required', 'reschedule_allowed', 'accessibility_contact_required'] as const

function mapRow(row: Record<string, unknown>): LocationReservationConfig {
  return {
    location_id: String(row.location_id),
    organization_id: String(row.organization_id),
    slot_capacity: row.slot_capacity === null ? null : Number(row.slot_capacity),
    advance_notice_minutes: row.advance_notice_minutes === null ? null : Number(row.advance_notice_minutes),
    minimum_guest_age: row.minimum_guest_age === null ? null : Number(row.minimum_guest_age),
    deposit_required: Number(row.deposit_required) === 1,
    deposit_trigger_party_size: row.deposit_trigger_party_size === null ? null : Number(row.deposit_trigger_party_size),
    free_cancellation_until_minutes: row.free_cancellation_until_minutes === null ? null : Number(row.free_cancellation_until_minutes),
    reschedule_allowed: Number(row.reschedule_allowed) === 1,
    reschedule_cutoff_minutes: row.reschedule_cutoff_minutes === null ? null : Number(row.reschedule_cutoff_minutes),
    accessibility_contact_required: Number(row.accessibility_contact_required) === 1,
    additional_notes_html: row.additional_notes_html === null ? null : String(row.additional_notes_html),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

/**
 * Read a location's reservation policy.
 *
 * `null` means this location does not take reservations. That is the absence
 * of the capability, not a location whose policy happens to be empty, and
 * callers must say so rather than showing a default policy nobody wrote.
 */
export async function getLocationReservationConfig(
  db: DbClient,
  input: { organizationId: string; locationId: string },
): Promise<LocationReservationConfig | null> {
  const row = await queryFirst<Record<string, unknown>>(db, `
    SELECT * FROM location_reservation_configs WHERE organization_id = ? AND location_id = ?
  `, [input.organizationId, input.locationId])
  return row ? mapRow(row) : null
}

export async function requireLocationReservationConfig(
  db: DbClient,
  input: { organizationId: string; locationId: string },
): Promise<LocationReservationConfig> {
  const config = await getLocationReservationConfig(db, input)
  if (!config) throw new HTTPError({ statusCode: 409, statusMessage: 'This location does not take reservations' })
  return config
}


const ALLOWED_NOTES_TAGS = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a'])
const ALLOWED_NOTES_ATTRS: Record<string, Set<string>> = { a: new Set(['href', 'target', 'rel']) }

// Uses the Workers runtime's native HTMLRewriter rather than a DOM-based sanitizer
// (e.g. DOMPurify/jsdom) — those depend on Node's `vm`/native bindings and crash the
// whole Worker at module load if imported anywhere in the server bundle, since jsdom
// has no Workers-compatible build. See utils/sanitize.ts's server-side fallback for
// the same constraint on the client/shared sanitize path.
async function sanitizeAdditionalNotesHtml(value: string | null): Promise<string | null> {
  if (!value) return null
  const rewriter = new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase()
      if (!ALLOWED_NOTES_TAGS.has(tag)) {
        el.removeAndKeepContent()
        return
      }
      const allowedAttrs = ALLOWED_NOTES_ATTRS[tag] ?? new Set<string>()
      // Workers' HTMLRewriter Element.attributes is IterableIterator<string[]> (name/value
      // pairs), but @cloudflare/workers-types' global `Element` collides with lib.dom's
      // `Element` in this project's tsconfig (both declare a same-named global interface),
      // so TS resolves .attributes to the DOM NamedNodeMap shape here. Cast back to the
      // actual runtime shape rather than touching the shared tsconfig lib/types config.
      const attrPairs = el.attributes as unknown as IterableIterator<[string, string]>
      for (const [name] of [...attrPairs]) {
        if (!allowedAttrs.has(name)) el.removeAttribute(name)
      }
      if (tag === 'a') {
        el.setAttribute('href', sanitizeUrl(el.getAttribute('href')))
        el.setAttribute('rel', 'noopener noreferrer')
      }
    },
  })
  const response = rewriter.transform(new Response(`<div>${value}</div>`, { headers: { 'content-type': 'text/html' } }))
  const rewritten = await response.text()
  const sanitized = rewritten.replace(/^<div>/, '').replace(/<\/div>$/, '').trim()
  return sanitized || null
}



export async function validateLocationReservationConfigPatch(input: Record<string, unknown>): Promise<LocationReservationConfigPatch> {
  const patch: LocationReservationConfigPatch = {}
  const unknown = Object.keys(input).filter(key => !([...NUMERIC_FIELDS, ...BOOLEAN_FIELDS, 'additional_notes_html'] as readonly string[]).includes(key))
  if (unknown.length) throw new HTTPError({ statusCode: 400, statusMessage: `Unsupported field${unknown.length > 1 ? 's' : ''}: ${unknown.sort().join(', ')}` })

  for (const field of NUMERIC_FIELDS) {
    if (!Object.hasOwn(input, field)) continue
    const value = input[field]
    if (value === null) { patch[field] = null; continue }
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be a non-negative integer or null` })
    }
    patch[field] = value as number
  }
  for (const field of BOOLEAN_FIELDS) {
    if (!Object.hasOwn(input, field)) continue
    if (typeof input[field] !== 'boolean') throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be a boolean` })
    patch[field] = input[field]
  }
  if (Object.hasOwn(input, 'additional_notes_html')) {
    const value = input.additional_notes_html
    if (value !== null && typeof value !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: 'additional_notes_html must be a string or null' })
    // Notes are rendered into a guest-facing page, so they are sanitized here
    // — once, on the way in — rather than at each render site.
    patch.additional_notes_html = await sanitizeAdditionalNotesHtml(value)
  }
  if (patch.deposit_trigger_party_size !== undefined && patch.deposit_trigger_party_size !== null && patch.deposit_trigger_party_size < 1) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'deposit_trigger_party_size must be at least 1' })
  }
  return patch
}

/**
 * Create or amend a location's reservation policy.
 *
 * Creating the row is what enables reservations at that location. Fields the
 * caller omits keep their stored value; fields set to null are cleared to
 * "not stated", which is different from a default.
 */
export async function upsertLocationReservationConfig(db: DbClient, input: {
  organizationId: string
  locationId: string
  patch: LocationReservationConfigPatch
  actorId: string
}): Promise<LocationReservationConfig> {
  const now = new Date().toISOString()
  const existing = await getLocationReservationConfig(db, input)
  const merged: LocationReservationConfigPatch = { ...(existing ?? {}), ...input.patch }
  await executeBatch(db, [{
    query: `
      INSERT INTO location_reservation_configs (
        location_id, organization_id, slot_capacity, advance_notice_minutes, minimum_guest_age,
        deposit_required, deposit_trigger_party_size, free_cancellation_until_minutes,
        reschedule_allowed, reschedule_cutoff_minutes, accessibility_contact_required,
        additional_notes_html, created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (location_id) DO UPDATE SET
        slot_capacity = excluded.slot_capacity, advance_notice_minutes = excluded.advance_notice_minutes,
        minimum_guest_age = excluded.minimum_guest_age, deposit_required = excluded.deposit_required,
        deposit_trigger_party_size = excluded.deposit_trigger_party_size,
        free_cancellation_until_minutes = excluded.free_cancellation_until_minutes,
        reschedule_allowed = excluded.reschedule_allowed, reschedule_cutoff_minutes = excluded.reschedule_cutoff_minutes,
        accessibility_contact_required = excluded.accessibility_contact_required,
        additional_notes_html = excluded.additional_notes_html,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `,
    params: [
      input.locationId, input.organizationId,
      merged.slot_capacity ?? null, merged.advance_notice_minutes ?? null, merged.minimum_guest_age ?? null,
      (merged.deposit_required ?? false) ? 1 : 0, merged.deposit_trigger_party_size ?? null,
      merged.free_cancellation_until_minutes ?? null, (merged.reschedule_allowed ?? true) ? 1 : 0,
      merged.reschedule_cutoff_minutes ?? null, (merged.accessibility_contact_required ?? false) ? 1 : 0,
      merged.additional_notes_html ?? null, now, now, input.actorId, input.actorId,
    ],
  }], { operation: 'Upsert location reservation config' })
  return requireLocationReservationConfig(db, input)
}

export async function deleteLocationReservationConfig(db: DbClient, input: { organizationId: string; locationId: string }): Promise<void> {
  // Removing the policy removes the capability, and takes its date overrides
  // with it. Existing reservations keep their own records.
  await executeBatch(db, [{
    query: 'DELETE FROM location_reservation_configs WHERE organization_id = ? AND location_id = ?',
    params: [input.organizationId, input.locationId],
  }], { operation: 'Delete location reservation config' })
}

/** The summary renderer speaks in the shared shape, whatever the source. */
export function reservationPolicySummarySource(config: LocationReservationConfig) {
  return {
    policy_type: 'reservation' as const,
    advance_notice_minutes: config.advance_notice_minutes,
    free_cancellation_until_minutes: config.free_cancellation_until_minutes,
    reschedule_allowed: config.reschedule_allowed,
    reschedule_cutoff_minutes: config.reschedule_cutoff_minutes,
    deposit_required: config.deposit_required,
    deposit_trigger_party_size: config.deposit_trigger_party_size,
    minimum_guest_age: config.minimum_guest_age,
    accessibility_contact_required: config.accessibility_contact_required,
    additional_notes_html: config.additional_notes_html,
  }
}

/**
 * A product's booking policy, from its metafields.
 *
 * The policy text is a typed product attribute, so there is nothing to merge
 * and nothing to cascade: a product either has the attribute or it does not.
 */
export function productPolicySummarySource(metafields: Record<string, unknown>) {
  const notes = metafields['booking.cancellation-policy']
  return {
    policy_type: 'experience' as const,
    advance_notice_minutes: null,
    free_cancellation_until_minutes: null,
    reschedule_allowed: null,
    reschedule_cutoff_minutes: null,
    deposit_required: null,
    deposit_trigger_party_size: null,
    minimum_guest_age: null,
    accessibility_contact_required: null,
    additional_notes_html: typeof notes === 'string' ? notes : null,
  }
}

// ---------------------------------------------------------------------------
// Reservation availability and claiming.
//
// A reservation has no materialized occurrence: a restaurant does not schedule
// dinners the way a studio schedules classes. Slots are computed from the
// location's opening hours, narrowed by its date overrides, and capacity is
// per START-TIME SLOT — the contract chosen once here and not re-decided by
// each caller.
//
// This is deliberately NOT the session code under another name. There is no
// generation, no occurrence key, and nothing to regenerate.
// ---------------------------------------------------------------------------

export interface ReservationSlot {
  time_slot: string
  starts_at: string
  capacity: number | null
  claimed: number
  remaining: number | null
  is_closed: boolean
  is_full: boolean
  note: string | null
}

interface LocationHoursRow {
  id: string
  organization_id: string
  site_id: string
  timezone: string | null
  status: string
  opening_hours: string | null
  special_hours: string | null
}

export async function listReservationSlots(db: DbClient, input: {
  organizationId: string
  locationId: string
  date: string
  includePast?: boolean
  excludeReservationId?: string | null
}): Promise<{ timezone: string; slots: ReservationSlot[] }> {
  const location = await queryFirst<LocationHoursRow>(db, `
    SELECT id, organization_id, site_id, timezone, status, opening_hours, special_hours
      FROM business_locations WHERE organization_id = ? AND id = ?
  `, [input.organizationId, input.locationId])
  if (!location) throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
  if (!isValidTimezone(location.timezone)) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Set the location timezone before taking reservations' })
  }
  const timezone = location.timezone
  const config = await requireLocationReservationConfig(db, input)

  const hours = parseOpeningHours(location.opening_hours ? JSON.parse(location.opening_hours) : null)
  const special = parseSpecialHours(location.special_hours ? JSON.parse(location.special_hours) : null)
  const scheduled = generateReservationTimes(hours, input.date, { specialHours: special })

  const overrides = await queryAll<{ time_slot: string | null; status: string; capacity: number | null; note: string | null }>(db, `
    SELECT time_slot, status, capacity, note FROM location_reservation_overrides
     WHERE organization_id = ? AND location_id = ? AND override_date = ?
  `, [input.organizationId, input.locationId, input.date])
  const wholeDay = overrides.find(entry => entry.time_slot === null)
  const bySlot = new Map(overrides.filter(entry => entry.time_slot !== null).map(entry => [entry.time_slot!, entry]))

  const claims = await queryAll<{ starts_at: string; total: number }>(db, `
    SELECT r.starts_at, SUM(r.party_size) AS total FROM reservations r
     WHERE r.organization_id = ? AND r.location_id = ? AND ${RESERVATION_CAPACITY_CONSUMING_SQL}
       AND r.id IS NOT ?
     GROUP BY r.starts_at
  `, [input.organizationId, input.locationId, input.excludeReservationId ?? null])
  const claimedByInstant = new Map(claims.map(row => [row.starts_at, Number(row.total)]))

  // Slots the merchant explicitly opened on this date appear even when the
  // regular hours do not cover them; that is what an override is for.
  const candidates = [...new Set([...scheduled, ...overrides.filter(entry => entry.time_slot && entry.status === 'open').map(entry => entry.time_slot!)])].sort()

  const closedAllDay = location.status !== 'active' || wholeDay?.status === 'closed'
  const slots: ReservationSlot[] = []
  for (const time of candidates) {
    let startsAt: string
    // A local time that does not exist on this date (a spring-forward gap) is
    // not offered; picking a neighbouring hour would book a guest at a time
    // nobody chose.
    try { startsAt = localDateTimeToInstant(input.date, time, timezone, 'reject').toISOString() }
    catch (error) { if (error instanceof RangeError) continue; throw error }
    if (!input.includePast && Date.parse(startsAt) <= Date.now()) continue

    const override = bySlot.get(time)
    const capacity = override?.capacity ?? wholeDay?.capacity ?? config.slot_capacity
    const claimed = claimedByInstant.get(startsAt) ?? 0
    const remaining = capacity === null ? null : capacity - claimed
    const isClosed = closedAllDay || override?.status === 'closed' || (!scheduled.includes(time) && override?.status !== 'open')
    slots.push({
      time_slot: time, starts_at: startsAt, capacity, claimed, remaining,
      is_closed: isClosed, is_full: remaining !== null && remaining <= 0,
      note: override?.note ?? wholeDay?.note ?? null,
    })
  }
  return { timezone, slots }
}

export class ReservationUnavailableError extends Error {
  constructor(message = 'That time is no longer available') {
    super(message)
    this.name = 'ReservationUnavailableError'
  }
}

/**
 * Claim a reservation slot.
 *
 * One statement carries its own capacity predicate, so two parties competing
 * for the last table cannot both succeed. `following` runs in the same batch,
 * which is how the inbox thread and the reservation commit together.
 */
export async function claimReservation(db: DbClient, input: {
  organizationId: string
  siteId: string
  locationId: string
  reservationId: string
  requestId: string | null
  customerId: string | null
  timezone: string
  startsAt: string
  endsAt: string
  partySize: number
  status?: 'pending' | 'confirmed'
  following?: BatchQuery[]
}): Promise<void> {
  if (!Number.isSafeInteger(input.partySize) || input.partySize < 1) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'party_size must be a positive integer' })
  }
  const now = new Date().toISOString()
  const claim: BatchQuery = {
    query: `
      INSERT INTO reservations (
        id, organization_id, site_id, location_id, customer_id, request_id,
        timezone, starts_at, ends_at, party_size, status, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM location_reservation_configs c
        WHERE c.location_id = ? AND c.organization_id = ?
          AND (c.slot_capacity IS NULL OR c.slot_capacity >= ? + COALESCE((
            SELECT SUM(r.party_size) FROM reservations r
            WHERE r.location_id = c.location_id AND r.starts_at = ? AND ${RESERVATION_CAPACITY_CONSUMING_SQL}
          ), 0))
      )
      ON CONFLICT (id) DO NOTHING
    `,
    params: [
      input.reservationId, input.organizationId, input.siteId, input.locationId, input.customerId, input.requestId,
      input.timezone, input.startsAt, input.endsAt, input.partySize, input.status ?? 'confirmed', now, now,
      input.locationId, input.organizationId, input.partySize, input.startsAt,
    ],
  }
  const results = await executeBatch(db, [claim, ...(input.following ?? [])], { operation: 'Claim reservation' })
  if ((results[0]?.meta?.changes ?? 0) === 0) throw new ReservationUnavailableError()
}
