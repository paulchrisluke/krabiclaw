export const ZARAZ_ANALYTICS_PURPOSE_ID = 'kc_analytics'

// Zaraz owns this cookie: it holds the visitor's answer for every purpose. Its
// presence means the visitor has answered, so the notice runs only when absent.
export const ZARAZ_CONSENT_COOKIE_NAME = 'kc_analytics_consent'

// The one optional tool Zaraz loads is Google Analytics; this purpose is its
// only switch. Krabiclaw's first-party measurement (/api/analytics/track) is
// not a Zaraz tool and does not read this consent.
export const ZARAZ_ANALYTICS_PURPOSE = {
  name: 'Google Analytics',
  description: 'Google Analytics sets cookies and measures how visitors use this site if you accept. This choice controls Google Analytics only; Krabiclaw\'s own first-party site measurement is separate and is not controlled here.',
}

export const ZARAZ_CONSENT_MODAL_INTRO_HTML = 'You can choose whether this site uses Google Analytics. Krabiclaw also measures site usage with its own first-party analytics, which runs separately from this choice. Read our <a href="https://krabiclaw.com/privacy">privacy policy</a>.'

/**
 * The event name the collector sends to Zaraz once the native pageview is accepted. The GA4
 * pageview action fires on a trigger that matches exactly this event and on nothing else, so Google
 * Analytics never records a page view the native record did not accept.
 */
export const NATIVE_PAGEVIEW_ZARAZ_EVENT = 'krabiclaw_native_pageview'
