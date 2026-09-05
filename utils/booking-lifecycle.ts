import type { BookingKind } from '~/utils/booking-presentation'

/**
 * Whether a booking is still waiting on the tenant before the guest has an
 * answer. Today uses it to count what needs attention; the booking screen uses
 * it to decide whether to offer confirm/cancel. One predicate, so the badge and
 * the buttons can never disagree about which bookings are outstanding.
 *
 * Restaurant reservations are born confirmed by the site's CMS capability.
 * `new` remains a genuine approval state for other reservation-enabled verticals;
 * historical restaurant records are not rewritten or interpreted as confirmed.
 */
export function bookingNeedsResponse(kind: BookingKind, status: string): boolean {
	return kind === 'reservation' ? status === 'new' : status === 'pending'
}
