// Carries booking confirmation details from the reservation or product booking
// form to the dedicated `/reservations/confirmed` or `/bookings/confirmed` page via sessionStorage —
// same-tab only, never sent to the server, so it can safely hold guest-entered text like
// special requests that we don't want round-tripping through the URL.

import { $fetch } from 'ofetch'
import { isValidInstant, isValidTimezone } from '~/utils/timezone'

export interface BookingConfirmation {
  type: 'reservation' | 'booking'
  status?: 'pending' | 'confirmed' | 'cancelled'
  operationalBookingId?: string
  requestId?: string
  organizationId: string
  organizationName: string
  policySummary?: ApiRecord | null
  guestName: string
  guestEmail?: string
  /**
   * The instant booked and the zone it belongs to.
   *
   * Not a date string plus a time string: that pair had no zone of its own, so
   * every reader guessed, and the guest could be shown an hour nobody booked.
   */
  startsAt: string
  timezone: string
  guests: string | number
  productId?: string | null
  title?: string
  requests?: string | null
  cancelUrl?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  message?: string
  locationId?: string | null
  locationName?: string | null
  locationAddress?: string | null
  locationSlug?: string | null
}

const STORAGE_KEY = 'kc:booking-confirmation'

export function setBookingConfirmation(payload: BookingConfirmation) {
  if (!import.meta.client) return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function getBookingConfirmation(currentOrganizationId: string): BookingConfirmation | null {
  if (!import.meta.client) return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as BookingConfirmation
    if (parsed.organizationId !== currentOrganizationId) return null
    return parsed
  } catch {
    return null
  }
}

/** The handoff supplies receipt details; the saved booking supplies its current state. */
export async function loadBookingConfirmation(
  organizationId: string,
  kind: BookingConfirmation['type'],
  organizationName: string,
  link: { id: string; token: string },
): Promise<BookingConfirmation | null> {
  const stored = getBookingConfirmation(organizationId)
  const handoff = stored?.type === kind ? stored : null
  let savedLink: URL | null = null
  if (handoff?.cancelUrl) {
    try { savedLink = new URL(handoff.cancelUrl, 'https://receipt.invalid') } catch { /* An explicit receipt link can still be read. */ }
  }
  const savedId = handoff?.requestId || savedLink?.searchParams.get('id') || ''
  const requestId = link.id || savedId
  const token = link.id ? link.token : savedLink?.hash.slice(1) ?? ''
  if (!requestId && !handoff) return null
  if (!requestId || !token) throw new Error('Open the booking link in your confirmation email to view this receipt.')

  const response = await $fetch<{ success: true; booking: {
    kind: BookingConfirmation['type']; status: 'pending' | 'confirmed' | 'cancelled'; name: string
    starts_at: string; timezone: string; guests: string; location_id: string | null; product_name: string | null
    location_name: string | null; location_slug: string | null
  } }>(`/api/public/booking-requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  })
  const booking = response?.booking
  if (response?.success !== true || !booking || booking.kind !== kind
    || !['pending', 'confirmed', 'cancelled'].includes(booking.status)
    || typeof booking.name !== 'string' || !isValidInstant(booking.starts_at) || !isValidTimezone(booking.timezone)
    || typeof booking.guests !== 'string' || (booking.location_id !== null && typeof booking.location_id !== 'string')) {
    throw new Error('This booking receipt could not be loaded.')
  }
  const matchingHandoff = requestId === savedId ? handoff : null
  const sameLocation = matchingHandoff?.locationId === booking.location_id
  return {
    ...matchingHandoff,
    type: kind, organizationId, organizationName: matchingHandoff?.organizationName ?? organizationName,
    requestId, status: booking.status, guestName: booking.name, startsAt: booking.starts_at,
    timezone: booking.timezone, guests: booking.guests, locationId: booking.location_id,
    locationName: booking.location_name,
    locationSlug: booking.location_slug,
    locationAddress: sameLocation ? matchingHandoff?.locationAddress : null,
    title: booking.product_name ?? matchingHandoff?.title,
    cancelUrl: booking.status === 'cancelled' ? null : `/${kind === 'reservation' ? 'reservations' : 'bookings'}/cancel?id=${encodeURIComponent(requestId)}#${token}`,
  }
}
