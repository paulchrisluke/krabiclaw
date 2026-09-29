import { ZARAZ_ANALYTICS_PURPOSE_ID } from '~/utils/zaraz-consent'

// An identifier is not consent. Whenever the visitor's analytics choice is anything but "accepted"
// and billing is being used signed in, ask the server to erase every GA identifier it stored for
// them. Called when the choice changes and when the authenticated dashboard mounts, so a choice
// made while signed out (accept, subscribe, sign out, reject, sign back in) is still honored.
// A failed reconciliation is not swallowed: the request rejects and reaches the error tracker.
export async function reconcileAnalyticsConsent(): Promise<void> {
  const consent = window.zaraz?.consent
  if (!consent?.APIReady || consent.getAll()[ZARAZ_ANALYTICS_PURPOSE_ID] === true) return
  const response = await fetch('/api/billing/analytics-consent', { method: 'POST', credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Analytics consent reconciliation was not applied (${response.status})`)
}
