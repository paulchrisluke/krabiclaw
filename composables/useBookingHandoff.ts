// Carries booking confirmation details from the reservation or product booking
// form to the dedicated `/reservations/confirmed` or `/bookings/confirmed` page via sessionStorage —
// same-tab only, never sent to the server, so it can safely hold guest-entered text like
// special requests that we don't want round-tripping through the URL.

export interface BookingConfirmation {
  type: 'reservation' | 'booking'
  siteId: string
  siteName: string
  policySummary?: ApiRecord | null
  guestName: string
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

export function getBookingConfirmation(currentSiteId: string): BookingConfirmation | null {
  if (!import.meta.client) return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as BookingConfirmation
    if (parsed.siteId !== currentSiteId) return null
    return parsed
  } catch {
    return null
  }
}
