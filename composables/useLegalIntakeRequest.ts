// Creates, retains, and clears the browser-side public intake request
// reference that server/api/public/sites/[siteId]/legal/intakes/*.ts
// forward to Blawby as requestReference (R14, plan step 1-3). Follows the
// repo's U5 sessionStorage-recovery pattern, keyed per SITE (not per
// organization) -- R14 explicitly calls for a
// "site-scoped sessionStorage entry", since a public visitor's request is
// bound to the site they are on, never to a dashboard organization
// context they have no session for.

const STORAGE_PREFIX = 'kc:legal-intake:'

function storageKey(siteId: string): string {
  return `${STORAGE_PREFIX}${siteId}`
}

// crypto.randomUUID() is available in every browser this public site
// already requires; no polyfill added.
function generateUuidV4(): string {
  return crypto.randomUUID()
}

/**
 * Returns the site's already-retained intake request reference, or creates
 * and retains a fresh UUID v4 if none exists yet. Call this once, before
 * the first mutating intake request (create), and reuse the returned value
 * for every retry/recovery/checkout/status/post-pay call for that same
 * intake -- a response-loss retry must reuse the same reference, never
 * generate a new one (R14).
 */
export function getOrCreateLegalIntakeRequestKey(siteId: string): string | null {
  if (!import.meta.client) return null
  const key = storageKey(siteId)
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const created = generateUuidV4()
  sessionStorage.setItem(key, created)
  return created
}

/**
 * Returns the site's retained intake request reference without creating
 * one -- for pages (e.g. the Payment Link return page) that must recover
 * an in-flight reference but never start a new intake on their own.
 */
export function peekLegalIntakeRequestKey(siteId: string): string | null {
  if (!import.meta.client) return null
  return sessionStorage.getItem(storageKey(siteId))
}

/**
 * Clears only this site's own retained intake request reference -- call
 * this once a terminal outcome (success or a definitively failed/abandoned
 * intake) is reached, per R14's "clears it only after a terminal outcome".
 * Never touches another site's entry.
 */
export function clearLegalIntakeRequestKey(siteId: string): void {
  if (!import.meta.client) return
  sessionStorage.removeItem(storageKey(siteId))
}
