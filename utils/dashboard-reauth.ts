// Shared by middleware/dashboard.global.ts (redirect decision) and
// tests/unit/dashboard-reauth.test.ts. Isomorphic (client+server) per Nuxt's
// top-level utils/ auto-import convention — see utils/phone.ts for another
// pure client+server helper living at this level.

const INBOX_DEEP_LINK_PATH = /^\/dashboard\/[^/]+\/sites\/[^/]+(?:\/locations\/[^/]+)?\/inbox(?:\/.*)?$/

/**
 * True when `path` is the WhatsApp-notification-driven guest-thread deep link
 * (`/dashboard/{org}/sites/{site}/inbox` or
 * `/dashboard/{org}/sites/{site}/locations/{location}/inbox`) — the dashboard
 * route reached from an outbound WhatsApp notification link (issue #293,
 * Section B: "an expired/absent session triggers WhatsApp OTP and returns to
 * that same validated thread").
 *
 * Only this path forces the focused WhatsApp-OTP login branch (`mode=whatsapp`)
 * on reauth. Every other dashboard route falls back to the normal login
 * screen (Google/email included) — most owners/admins never activate WhatsApp
 * OTP at all, so funneling every expired dashboard session into a phone-only
 * flow they can't complete would be a regression, not a fix.
 */
export function isWhatsAppInboxDeepLinkPath(path: string): boolean {
  return INBOX_DEEP_LINK_PATH.test(path)
}
