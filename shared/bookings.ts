/**
 * Booking, session and reservation state.
 *
 * Two states, because a person decides two things: it is happening, or it is
 * not. `pending` meant "waiting for a host to approve", which nobody does —
 * reservations already wrote `confirmed` outright while experiences waited on
 * a click that never came, leaving thirteen rows pending with every date months
 * in the past. `completed` meant "someone marked this done"; a booking whose
 * end has passed and was never cancelled is done, and nobody should have to say
 * so.
 *
 * A guest who does not turn up is a conversation with the tenant, not a state.
 */

export const PRODUCT_SESSION_STATUSES = ['scheduled', 'cancelled'] as const
export type ProductSessionStatus = typeof PRODUCT_SESSION_STATUSES[number]

export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const
export type BookingStatus = typeof BOOKING_STATUSES[number]

export const RESERVATION_STATUSES = ['confirmed', 'cancelled'] as const
export type ReservationStatus = typeof RESERVATION_STATUSES[number]

export const LOCATION_RESERVATION_OVERRIDE_STATUSES = ['open', 'closed'] as const
export type LocationReservationOverrideStatus = typeof LOCATION_RESERVATION_OVERRIDE_STATUSES[number]

/**
 * A booking holds its seat unless it was cancelled. There is no hold to expire:
 * the seat and the thread are written in one atomic batch, so a claim without a
 * booking never exists. When Stripe Connect lands, Stripe owns the payment hold
 * and we record paid as confirmed.
 *
 * A booking holding a seat is NOT a statement about payment. Money is not
 * represented on a booking at all.
 */
export function bookingConsumesCapacity(booking: { status: BookingStatus }): boolean {
  return booking.status === 'confirmed'
}

/** The same rule as SQL, for use inside a capacity-claim predicate. */
export const CAPACITY_CONSUMING_SQL = `b.status = 'confirmed'`

export const RESERVATION_CAPACITY_CONSUMING_SQL = `r.status = 'confirmed'`

/**
 * Done is a fact about the clock, not a stored state: a booking that was not
 * cancelled and whose end has passed is complete. `ends_at`, never `starts_at`
 * — a dinner booked 19:00–21:00 is not over at 19:01.
 */
export function isBookingComplete(booking: { status: BookingStatus; ends_at: string }, at: string): boolean {
  return booking.status === 'confirmed' && booking.ends_at < at
}

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
