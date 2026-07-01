// Carries contact-form confirmation details from the contact page to the dedicated
// `/contact/confirmed` page via sessionStorage — same-tab only, mirrors useBookingHandoff.

export interface ContactConfirmation {
  siteId: string
  siteName: string
  guestName: string
  subject?: string | null
}

const STORAGE_KEY = 'kc:contact-confirmation'

export function setContactConfirmation(payload: ContactConfirmation) {
  if (!import.meta.client) return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function getContactConfirmation(currentSiteId: string): ContactConfirmation | null {
  if (!import.meta.client) return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ContactConfirmation
    if (parsed.siteId !== currentSiteId) return null
    return parsed
  } catch {
    return null
  }
}
