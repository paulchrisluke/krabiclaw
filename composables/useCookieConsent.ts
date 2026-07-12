// Shared, platform-wide cookie-consent gate for third-party marketing/ad
// scripts (GTM, gtag). Strict opt-in: nothing gated by this reads as
// 'accepted' until the visitor explicitly clicks Accept.
//
// Nuxt's useCookie is NOT a true cross-call singleton: each call creates its
// own independent ref, kept in sync with other call sites only via an async
// BroadcastChannel/cookieStore message. That's fine across tabs/reloads, but
// it means accepting in ConsentBanner isn't guaranteed to be visible
// synchronously to a same-tick read in useBlawbyConversionTracking.ts. Nuxt's
// useState, by contrast, is a real synchronous singleton per key — so it's
// the actual reactive source of truth here, with the cookie used only for
// persistence across sessions.
//
// Deliberately does NOT gate KrabiClaw's own first-party visitor/session
// analytics (server/utils/pageview-tracking.ts) or Blawby's native
// conversion-events beacon — those are first-party product/business
// analytics, not third-party ads, and are out of scope by design.
export type CookieConsentValue = 'accepted' | 'rejected' | null

export function useCookieConsent() {
  const cookie = useCookie<CookieConsentValue>('kc_consent', {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    default: () => null,
  })
  const consent = useState<CookieConsentValue>('kc-consent-state', () => cookie.value)

  function accept() {
    consent.value = 'accepted'
    cookie.value = 'accepted'
  }

  function reject() {
    consent.value = 'rejected'
    cookie.value = 'rejected'
  }

  return { consent, accept, reject }
}
