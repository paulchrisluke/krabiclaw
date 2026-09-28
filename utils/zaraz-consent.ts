export const ZARAZ_ANALYTICS_PURPOSE_ID = 'kc_analytics'

// Zaraz owns this cookie: it holds the visitor's answer for every purpose. Its
// presence means the visitor already has an answer, granted by default or
// rejected, so the default grant and the notice run only when it is absent.
export const ZARAZ_CONSENT_COOKIE_NAME = 'kc_analytics_consent'

// The one optional tool Zaraz loads is Google Analytics; this purpose is its
// only switch. Krabiclaw's first-party measurement (/api/analytics/track) is
// not a Zaraz tool and does not read this consent.
export const ZARAZ_ANALYTICS_PURPOSE = {
  name: 'Google Analytics',
  description: 'Google Analytics sets cookies and measures how visitors use this site. It is on unless you turn it off here. This choice controls Google Analytics only; Krabiclaw\'s own first-party site measurement is separate and is not controlled here.',
}

export const ZARAZ_CONSENT_MODAL_INTRO_HTML = 'This site uses Google Analytics unless you turn it off. Krabiclaw also measures site usage with its own first-party analytics, which runs separately from these choices. Read our <a href="https://krabiclaw.com/privacy">privacy policy</a>.'
