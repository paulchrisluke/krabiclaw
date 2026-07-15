// Shared, platform-wide cookie-consent gate for third-party marketing/ad
// scripts (GTM, gtag). Strict opt-in: nothing gated by this reads as
// 'accepted' until the visitor explicitly clicks Accept.
//
// This intentionally uses plain useCookie, NOT useState. useState was tried
// first (to get a true synchronous singleton across call sites in the same
// page) but caused a serious bug: in this app's dev runtime (Nitro on
// Cloudflare Workers/miniflare), useState's value leaked ACROSS REQUESTS —
// one visitor's "accepted" cookie value was observed on a completely
// different browser session with zero cookies, because the server-side
// state wasn't being reset per-request the way it should be. Verified via
// Playwright: a fresh context with no cookies rendered the banner as already
// dismissed. useCookie's server-side read, by contrast, calls
// getRequestHeader(useRequestEvent(), 'cookie') fresh on every read — there
// is no shared mutable state to leak. The tradeoff is that separate
// useCookie('kc_consent') calls in the same page are independent refs kept
// in sync only asynchronously (BroadcastChannel/cookieStore) rather than
// synchronously — acceptable here since accept()/reject() and any
// consent-gated action are always separate user interactions in time, never
// the same synchronous tick.
//
// Implements Google's Consent Mode v2 signal pattern (default denied, then
// an explicit update on the visitor's decision) rather than a bare
// load/don't-load gate on the GTM/gtag script tag itself. This is Google's
// documented approach for EEA/GDPR compliance — it lets the tag still
// receive "cookieless ping" signals for basic modeling while genuinely
// respecting the denied state, and is what both Saya's gtag.js and Blawby's
// GTM container read via the same dataLayer.push(['consent', ...]) commands
// (this works whether or not the actual gtag.js library is loaded — GTM
// itself understands these raw dataLayer entries).
//
// Deliberately does NOT gate KrabiClaw's own first-party visitor/session
// analytics (server/utils/pageview-tracking.ts) or Blawby's native
// conversion-events beacon — those are first-party product/business
// analytics, not third-party ads, and are out of scope by design.
export type CookieConsentValue = 'accepted' | 'rejected' | null

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

const CONSENT_CATEGORIES = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage'] as const

function consentState(value: CookieConsentValue): 'granted' | 'denied' {
  return value === 'accepted' ? 'granted' : 'denied'
}

function pushConsentCommand(command: 'default' | 'update', value: CookieConsentValue) {
  if (!import.meta.client) return
  window.dataLayer = window.dataLayer || []
  const state = consentState(value)
  window.dataLayer.push(['consent', command, Object.fromEntries(CONSENT_CATEGORIES.map(key => [key, state]))])
  pushZarazConsentCommand(command, value)
}

function pushZarazConsentCommand(command: 'default' | 'update', value: CookieConsentValue) {
  const state = consentState(value)
  window.zaraz?.set(
    command === 'default' ? 'google_consent_default' : 'google_consent_update',
    Object.fromEntries(CONSENT_CATEGORIES.map(key => [key, state])),
  )
}

// Module-level, client-only guard: fine here (unlike server-side state)
// because browser module state is genuinely per-visitor — there's no
// cross-request process to leak across.
let defaultConsentPushed = false
let lastBroadcastedConsent: CookieConsentValue = null

export function useCookieConsent() {
  const consent = useCookie<CookieConsentValue>('kc_consent', {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    default: () => null,
  })

  if (import.meta.client && !defaultConsentPushed) {
    defaultConsentPushed = true
    pushConsentCommand('default', consent.value)
    lastBroadcastedConsent = consent.value
  }

  watch(consent, (next) => {
    if (!import.meta.client || next === lastBroadcastedConsent) return
    lastBroadcastedConsent = next
    pushConsentCommand('update', next)
  })

  function accept() {
    lastBroadcastedConsent = 'accepted'
    consent.value = 'accepted'
    pushConsentCommand('update', 'accepted')
  }

  function reject() {
    lastBroadcastedConsent = 'rejected'
    consent.value = 'rejected'
    pushConsentCommand('update', 'rejected')
  }

  return { consent, accept, reject }
}
