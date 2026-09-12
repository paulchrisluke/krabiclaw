/**
 * Booking, session and reservation state.
 *
 * These sets live here rather than as CHECK constraints because D1 cannot
 * alter a CHECK on a referenced table, so adding one state would become an
 * impossible rebuild of `product_sessions` or `requests`.
 */

export const PRODUCT_SESSION_STATUSES = ['scheduled', 'cancelled', 'completed'] as const
export type ProductSessionStatus = typeof PRODUCT_SESSION_STATUSES[number]

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const
export type BookingStatus = typeof BOOKING_STATUSES[number]

export const RESERVATION_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const
export type ReservationStatus = typeof RESERVATION_STATUSES[number]

export const LOCATION_RESERVATION_OVERRIDE_STATUSES = ['open', 'closed'] as const
export type LocationReservationOverrideStatus = typeof LOCATION_RESERVATION_OVERRIDE_STATUSES[number]

/**
 * Which booking states hold a seat.
 *
 * `confirmed` and `completed` hold one: the seat is taken, and for a session
 * that already ran it stays taken in the record. `pending` holds one only
 * while its hold is unexpired — an abandoned checkout must not keep a class
 * full forever. `cancelled` holds none; cancelling releases exactly the seats
 * that booking claimed and no others.
 *
 * A booking holding a seat is NOT a statement about payment. Money is not
 * represented on a booking at all.
 */
export const CAPACITY_CONSUMING_BOOKING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'completed']

export function bookingConsumesCapacity(
  booking: { status: BookingStatus; hold_expires_at: string | null },
  at: string,
): boolean {
  if (!CAPACITY_CONSUMING_BOOKING_STATUSES.includes(booking.status)) return false
  if (booking.status !== 'pending') return true
  return booking.hold_expires_at === null || booking.hold_expires_at > at
}

/** The same rule as SQL, for use inside a capacity-claim predicate. */
export const CAPACITY_CONSUMING_SQL = `(
  b.status IN ('confirmed', 'completed')
  OR (b.status = 'pending' AND (b.hold_expires_at IS NULL OR b.hold_expires_at > ?))
)`

export const RESERVATION_CAPACITY_CONSUMING_SQL = `r.status IN ('pending', 'confirmed', 'completed')`

/**
 * The stable identity of a generated occurrence.
 *
 * Deliberately built from the rule and the INTENDED local start, never the
 * actual `starts_at`. Rescheduling a session changes its instant but not this
 * key, so regeneration finds the existing row and leaves it alone instead of
 * recreating the occurrence at its original time.
 */
export function occurrenceKey(ruleId: string, localDate: string, localStartTime: string): string {
  return `${ruleId}:${localDate}T${localStartTime}`
}

/** How far ahead a guest can book, in days. The public page and the session generator read the same number. */
export const PUBLIC_BOOKING_WINDOW_DAYS = 31
