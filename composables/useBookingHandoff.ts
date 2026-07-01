// Carries booking confirmation details from the reservation/experience booking form to the
// dedicated `/reservations/confirmed` or `/experiences/confirmed` page via sessionStorage —
// same-tab only, never sent to the server, so it can safely hold guest-entered text like
// special requests that we don't want round-tripping through the URL.

export interface BookingConfirmation {
  type: 'reservation' | 'experience'
  siteName: string
  guestName: string
  date: string
  time: string
  guests: string | number
  title?: string
  requests?: string | null
  cancelUrl?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  message?: string
}

const STORAGE_KEY = 'kc:booking-confirmation'

export function setBookingConfirmation(payload: BookingConfirmation) {
  if (!import.meta.client) return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function getBookingConfirmation(): BookingConfirmation | null {
  if (!import.meta.client) return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as BookingConfirmation
  } catch {
    return null
  }
}
