// Shared, platform-wide cookie-consent gate for third-party marketing/ad
// scripts (GTM, gtag). Strict opt-in: nothing gated by this reads as
// 'accepted' until the visitor explicitly clicks Accept. `useCookie` is
// already a per-name singleton in Nuxt, so every call site shares one
// reactive value without extra plumbing.
//
// Deliberately does NOT gate KrabiClaw's own first-party visitor/session
// analytics (server/utils/pageview-tracking.ts) or Blawby's native
// conversion-events beacon — those are first-party product/business
// analytics, not third-party ads, and are out of scope by design.
export type CookieConsentValue = 'accepted' | 'rejected' | null

export function useCookieConsent() {
  const consent = useCookie<CookieConsentValue>('kc_consent', {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    default: () => null,
  })

  function accept() {
    consent.value = 'accepted'
  }

  function reject() {
    consent.value = 'rejected'
  }

  return { consent, accept, reject }
}
