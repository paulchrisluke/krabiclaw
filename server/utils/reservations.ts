// Reservation slot overrides & capacity — mirrors the experience-booking capacity model in
// server/utils/experiences.ts (experience_slot_overrides / getSlotAvailability), scoped to a
// business_locations reservation instead of an experience, so both booking flows share one
// capacity concept: a per-location default (max_capacity), overridable per date+time_slot.
import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { generateReservationTimes, isStructuredOpeningHours } from '~/shared/reservation-hours'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function assertDateStr(value: string, field: string): void {
  if (!DATE_PATTERN.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be in "YYYY-MM-DD" format` })
  }
}

function assertFiniteNonNegative(value: number | null | undefined, field: string): void {
  if (value === null || value === undefined) return
  if (!Number.isFinite(value) || value < 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a non-negative number` })
  }
}

export interface ReservationSlotOverride {
  id: string
  location_id: string
  organization_id: string
  site_id: string
  override_date: string
  time_slot: string
  status: 'closed' | 'open'
  capacity_override: number | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface ReservationSlotAvailability {
  time_slot: string
  capacity: number | null
  booked: number
  remaining: number | null
  is_closed: boolean
  is_full: boolean
}

export async function listReservationSlotOverrides(
  db: DbClient,
  siteId: string,
  locationId: string,
  opts: { fromDate?: string; toDate?: string } = {},
): Promise<ReservationSlotOverride[]> {
  let sql = `SELECT id, location_id, organization_id, site_id, override_date, time_slot,
                    status, capacity_override, note, created_at, updated_at
             FROM reservation_slot_overrides
             WHERE site_id = ? AND location_id = ?`
  const params: string[] = [siteId, locationId]
  if (opts.fromDate) {
    assertDateStr(opts.fromDate, 'from')
    sql += ` AND override_date >= ?`
    params.push(opts.fromDate)
  }
  if (opts.toDate) {
    assertDateStr(opts.toDate, 'to')
    sql += ` AND override_date <= ?`
    params.push(opts.toDate)
  }
  sql += ` ORDER BY override_date ASC, time_slot ASC`
  const results = await queryAll<ReservationSlotOverride>(db, sql, params)
  return results ?? []
}

export async function upsertReservationSlotOverride(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  input: {
    override_date: string
    time_slot: string
    status: 'closed' | 'open'
    capacity_override?: number | null
    note?: string | null
  },
  userId: string,
): Promise<ReservationSlotOverride> {
  assertDateStr(input.override_date, 'override_date')
  if (!TIME_SLOT_PATTERN.test(input.time_slot)) {
    throw createError({ statusCode: 400, statusMessage: 'time_slot must be in "HH:MM" format' })
  }
  if (input.status !== 'closed' && input.status !== 'open') {
    throw createError({ statusCode: 400, statusMessage: 'status must be "closed" or "open"' })
  }
  assertFiniteNonNegative(input.capacity_override, 'capacity_override')

  const location = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`,
    [locationId, siteId],
  )
  if (!location) {
    throw createError({ statusCode: 404, statusMessage: 'Location not found or does not belong to this site' })
  }

  const now = new Date().toISOString()
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM reservation_slot_overrides WHERE location_id = ? AND override_date = ? AND time_slot = ? LIMIT 1`,
    [locationId, input.override_date, input.time_slot],
  )
  const id = existing?.id ?? crypto.randomUUID()

  await execute(
    db,
    `INSERT INTO reservation_slot_overrides
       (id, location_id, organization_id, site_id, override_date, time_slot, status, capacity_override, note, created_at, updated_at, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(location_id, override_date, time_slot) DO UPDATE SET
         status = excluded.status,
         capacity_override = excluded.capacity_override,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    [
      id, locationId, organizationId, siteId,
      input.override_date, input.time_slot, input.status,
      input.capacity_override ?? null, input.note ?? null,
      now, now, userId,
    ],
  )

  const row = await queryFirst<ReservationSlotOverride>(
    db,
    `SELECT id, location_id, organization_id, site_id, override_date, time_slot,
              status, capacity_override, note, created_at, updated_at
       FROM reservation_slot_overrides
       WHERE location_id = ? AND override_date = ? AND time_slot = ?`,
    [locationId, input.override_date, input.time_slot],
  )
  if (!row) throw new Error('Failed to read back reservation slot override after upsert.')
  return row
}

export async function deleteReservationSlotOverride(
  db: DbClient,
  siteId: string,
  locationId: string,
  overrideId: string,
): Promise<boolean> {
  const result = await execute(
    db,
    `DELETE FROM reservation_slot_overrides WHERE site_id = ? AND location_id = ? AND id = ?`,
    [siteId, locationId, overrideId],
  )
  return Boolean(result.meta.changes)
}

/**
 * Computes remaining capacity per generated reservation time slot for a location on a given
 * date, merging booked totals (from reservation_submissions, all non-cancelled statuses) with
 * any manual slot override. Mirrors getSlotAvailability() in server/utils/experiences.ts — the
 * single function every surface (public booking, editor CMS, MCP) must call; no capacity logic
 * should be duplicated elsewhere.
 *
 * '8+' party sizes count as 8 toward capacity — the same floor used everywhere else guest count
 * is capped in this codebase (BookingTimeStep's guestsMax, VALID_GUESTS).
 */
export async function getReservationSlotAvailability(
  db: DbClient,
  siteId: string,
  location: { id: string; max_capacity: number | null; opening_hours: unknown },
  dateStr: string,
): Promise<ReservationSlotAvailability[]> {
  assertDateStr(dateStr, 'date')
  const effectiveSlots = isStructuredOpeningHours(location.opening_hours)
    ? generateReservationTimes(location.opening_hours, dateStr)
    : []
  if (effectiveSlots.length === 0) return []

  const bookingRows = await queryAll<{ time: string; booked: number }>(
    db,
    `SELECT time, SUM(CAST(REPLACE(guests, '+', '') AS INTEGER)) AS booked
       FROM reservation_submissions
       WHERE site_id = ? AND location_id = ? AND date = ? AND status != 'cancelled'
       GROUP BY time`,
    [siteId, location.id, dateStr],
  )
  const bookedMap = Object.fromEntries((bookingRows ?? []).map((r) => [r.time, r.booked]))

  const overrideRows = await queryAll<{ time_slot: string; status: 'closed' | 'open'; capacity_override: number | null }>(
    db,
    `SELECT time_slot, status, capacity_override
       FROM reservation_slot_overrides
       WHERE site_id = ? AND location_id = ? AND override_date = ?`,
    [siteId, location.id, dateStr],
  )
  const overrideMap = Object.fromEntries((overrideRows ?? []).map((r) => [r.time_slot, r]))

  return effectiveSlots.map((slot) => {
    const override = overrideMap[slot]
    const capacity = override?.capacity_override ?? location.max_capacity ?? null
    const booked = bookedMap[slot] ?? 0
    const remaining = capacity == null ? null : capacity - booked
    const is_closed = override?.status === 'closed'
    const is_full = remaining !== null && remaining <= 0
    return { time_slot: slot, capacity, booked, remaining, is_closed, is_full }
  })
}
