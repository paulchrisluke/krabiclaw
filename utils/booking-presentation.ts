import { normalizeVertical } from '~/utils/vertical-copy'

/**
 * What a tenant and their guest call one booking.
 *
 * The single source of this vocabulary. Before this existed the dashboard, the
 * booking detail screen and the guest-facing change page each derived the noun
 * locally and disagreed: a professional-services org read "You have 3
 * consultations" on Today, opened one, and the same record was a "booking"
 * everywhere else including the email its guest received.
 *
 * Words only. Whether a booking needs the tenant's approval is a lifecycle
 * question and belongs with the per-site capabilities, not here.
 */
export interface BookingPresentation {
	/** Lowercase, for mid-sentence use: `Change ${noun}`. */
	noun: string
	nounPlural: string
	/** Sentence case, for headings and labels. */
	label: string
	labelPlural: string
}

export type BookingKind = 'reservation' | 'experience_booking'

const RESERVATION: BookingPresentation = {
	noun: 'reservation',
	nounPlural: 'reservations',
	label: 'Reservation',
	labelPlural: 'Reservations',
}

const CONSULTATION: BookingPresentation = {
	noun: 'consultation',
	nounPlural: 'consultations',
	label: 'Consultation',
	labelPlural: 'Consultations',
}

const BOOKING: BookingPresentation = {
	noun: 'booking',
	nounPlural: 'bookings',
	label: 'Booking',
	labelPlural: 'Bookings',
}

/**
 * The noun is keyed by what was booked, then narrowed by the vertical. A
 * restaurant that also sells experiences takes a *reservation* for a table and
 * a *booking* for an experience, so the kind has to lead — deriving from the
 * site's vertical alone would call both of them reservations.
 */
export function resolveBookingPresentation(kind: BookingKind, vertical: string | null | undefined): BookingPresentation {
	if (kind === 'experience_booking') return BOOKING
	if (!vertical?.trim()) throw new Error('Cannot resolve booking vocabulary: missing vertical')
	return normalizeVertical(vertical) === 'professional_service' ? CONSULTATION : RESERVATION
}

/**
 * For views that count across kinds and sites at once. One shared noun only
 * when everything on screen agrees; anything mixed is a booking, which is the
 * one word that is true of all of them.
 */
export function resolveAggregateBookingPresentation(
	entries: Array<{ kind: BookingKind; vertical: string | null | undefined }>,
): BookingPresentation {
	const distinct = new Map<string, BookingPresentation>()
	for (const entry of entries) {
		const presentation = resolveBookingPresentation(entry.kind, entry.vertical)
		distinct.set(presentation.noun, presentation)
		if (distinct.size > 1) return BOOKING
	}
	return distinct.values().next().value ?? BOOKING
}

export function bookingCountLabel(presentation: BookingPresentation, count: number): string {
	return `${count} ${count === 1 ? presentation.noun : presentation.nounPlural}`
}
