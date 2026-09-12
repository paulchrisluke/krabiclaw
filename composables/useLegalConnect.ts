// Creates, retains, and clears the browser-side Connect request key that
// server/api/dashboard/legal/connect/index.post.ts forwards to Blawby as
// requestReference (plan step 6, R14). sessionStorage-backed, same-tab
// only, following composables/useBookingHandoff.ts's existing pattern for
// this repo's sessionStorage-recovery convention — keyed per organization
// (not per confirmation payload), so a key can never be reused across
// organizations and clearing one organization's entry never touches another's.
// There is one Connect operation per organization at a time, which is why the
// organization alone identifies it.

const STORAGE_PREFIX = 'kc:legal-connect:'

function storageKey(organizationId: string): string {
  return `${STORAGE_PREFIX}${organizationId}`
}

// crypto.randomUUID() is available in every browser this dashboard already
// requires (Chrome 92+, Firefox 95+, Safari 15.4+); no polyfill added.
function generateUuidV4(): string {
  return crypto.randomUUID()
}

/**
 * Returns the organization's already-retained Connect request key, or
 * creates and retains a fresh UUID v4 if none exists yet. Call this once,
 * before the first mutating Connect request, and reuse the returned value
 * for every retry of that same operation (a response-loss retry must reuse
 * the same key, never generate a new one).
 */
export function getOrCreateLegalConnectKey(organizationId: string): string | null {
  if (!import.meta.client) return null
  const key = storageKey(organizationId)
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const created = generateUuidV4()
  sessionStorage.setItem(key, created)
  return created
}

/**
 * Clears only this organization's own retained Connect key — e.g. once the
 * Connect operation has completed successfully. Never touches another
 * organization's entry.
 */
export function clearLegalConnectKey(organizationId: string): void {
  if (!import.meta.client) return
  sessionStorage.removeItem(storageKey(organizationId))
}
