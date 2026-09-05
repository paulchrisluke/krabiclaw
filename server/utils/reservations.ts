import { queryAll, type DbClient } from '~/server/db'
import { generateReservationTimes, isStructuredOpeningHours } from '~/shared/reservation-hours'
import { isTimeSlotInPast } from '~/server/utils/site-config'
import {
  assertAvailabilityDate,
  materializeAvailabilitySlots,
  type PublicAvailabilitySlot,
} from '~/server/utils/availability'

export type ReservationSlotAvailability = PublicAvailabilitySlot

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
  timezone: string,
): Promise<ReservationSlotAvailability[]> {
  return (await getReservationSlotAvailabilityRange(db, siteId, location, [dateStr], timezone))[dateStr] ?? []
}

type ReservationAvailabilityDataRow = {
  kind: 'booking' | 'override'
  date: string
  time_slot: string
  status: 'closed' | 'open' | null
  capacity_override: number | null
  booked: number | null
}

export async function getReservationSlotAvailabilityRange(
  db: DbClient,
  siteId: string,
  location: { id: string; max_capacity: number | null; opening_hours: unknown },
  dateStrs: string[],
  timezone: string,
): Promise<Record<string, ReservationSlotAvailability[]>> {
  const dates = [...new Set(dateStrs)]
  dates.forEach(date => assertAvailabilityDate(date))
  if (dates.length === 0) return {}

  const rows = await queryAll<ReservationAvailabilityDataRow>(db, `
    WITH requested_dates(date) AS (SELECT value FROM json_each(?))
    SELECT 'override' AS kind, override_date AS date, time_slot, status, capacity_override, NULL AS booked
    FROM availability_overrides
    WHERE site_id = ? AND owner_type = 'location' AND location_id = ?
      AND override_date IN (SELECT date FROM requested_dates)
    UNION ALL
    SELECT 'booking' AS kind, date, time AS time_slot, NULL AS status, NULL AS capacity_override,
      SUM(CAST(REPLACE(guests, '+', '') AS INTEGER)) AS booked
    FROM reservation_submissions
    WHERE site_id = ? AND location_id = ?
      AND date IN (SELECT date FROM requested_dates)
      AND status != 'cancelled'
    GROUP BY date, time
  `, [JSON.stringify(dates), siteId, location.id, siteId, location.id])

  const overridesByDate = new Map<string, Map<string, ReservationAvailabilityDataRow>>()
  const bookingsByDate = new Map<string, Map<string, number>>()
  for (const row of rows ?? []) {
    if (row.kind === 'override') {
      const overrides = overridesByDate.get(row.date) ?? new Map<string, ReservationAvailabilityDataRow>()
      overrides.set(row.time_slot, row)
      overridesByDate.set(row.date, overrides)
      continue
    }
    const bookings = bookingsByDate.get(row.date) ?? new Map<string, number>()
    bookings.set(row.time_slot, row.booked ?? 0)
    bookingsByDate.set(row.date, bookings)
  }

  return Object.fromEntries(dates.map((dateStr) => {
    const scheduledSlots = (isStructuredOpeningHours(location.opening_hours)
      ? generateReservationTimes(location.opening_hours, dateStr)
      : []
    ).filter(slot => !isTimeSlotInPast(dateStr, slot, timezone))
    const overrideMap = overridesByDate.get(dateStr) ?? new Map<string, ReservationAvailabilityDataRow>()
    const bookedMap = bookingsByDate.get(dateStr) ?? new Map<string, number>()
    const overrides = [...overrideMap.values()]
      .filter(row => row.status !== null && !isTimeSlotInPast(dateStr, row.time_slot, timezone))
      .map(row => ({
        time_slot: row.time_slot,
        status: row.status as 'open' | 'closed',
        capacity_override: row.capacity_override,
      }))
    return [dateStr, materializeAvailabilitySlots({
      scheduledSlots,
      overrides,
      bookedBySlot: bookedMap,
      defaultCapacity: location.max_capacity ?? null,
    })]
  }))
}
