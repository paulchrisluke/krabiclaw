import { ZARAZ_ANALYTICS_PURPOSE_ID } from '~/utils/zaraz-consent'

// When the visitor changes their analytics choice to anything but "accepted" (the notice's
// Reject, or the Zaraz preferences modal), erase every GA identifier stored for their billing.
// A failed erasure is not swallowed: it surfaces as an unhandled error in the console and to
// the error tracker, because a stored identifier that outlives withdrawn consent must be known.
export default defineNuxtPlugin(() => {
  document.addEventListener('zarazConsentChoicesUpdated', async () => {
    if (window.zaraz?.consent?.getAll()[ZARAZ_ANALYTICS_PURPOSE_ID] === true) return
    const response = await fetch('/api/billing/analytics-consent-withdrawn', { method: 'POST', credentials: 'same-origin' })
    if (!response.ok) throw new Error(`Analytics consent withdrawal was not applied (${response.status})`)
  })
})
