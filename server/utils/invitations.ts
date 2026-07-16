// Shared helpers for the manager/team invitation-acceptance flow. Extracted
// so both the invitation GET (server/api/invitations/[invitationId].get.ts)
// and the accept POST (server/api/invitations/[invitationId]/accept.post.ts)
// can idempotently resolve the same "where does this invite land" answer
// instead of duplicating the logic (see issue #293, Section A).

export interface InvitationRedirectSite {
  id: string
  subdomain: string | null
  onboarding_status: string | null
}

/**
 * Computes where an accepted (or already-accepted, revisited) invitation
 * should land. Shared by the accept POST (fresh acceptance) and the GET
 * (idempotent re-visit of an already-accepted invite) so both routes agree.
 */
export function buildInvitationRedirectUrl(params: {
  orgSlug: string
  preferredSite: InvitationRedirectSite | null
  fallbackSites: InvitationRedirectSite[]
}): string {
  const orgBase = `/dashboard/${encodeURIComponent(params.orgSlug)}`

  const site = params.preferredSite
  if (site) {
    if (site.onboarding_status !== 'active') return `${orgBase}/~/onboarding`
    if (site.subdomain) return `${orgBase}/sites/${encodeURIComponent(site.subdomain)}`
  }

  if (params.fallbackSites.length === 1) {
    const onlySite = params.fallbackSites[0]!
    if (onlySite.onboarding_status !== 'active') return `${orgBase}/~/onboarding`
    if (onlySite.subdomain) return `${orgBase}/sites/${encodeURIComponent(onlySite.subdomain)}`
  }

  return orgBase
}

/**
 * Validates a client-supplied `returnTo` destination before trusting it as a
 * post-acceptance redirect. Only a same-origin relative path scoped to this
 * organization's dashboard is accepted — this is the one place an
 * unauthenticated-until-OTP client value flows into a redirect decision, so
 * it must not become an open-redirect vector.
 */
export function sanitizeInvitationReturnTo(returnTo: unknown, orgSlug: string): string | null {
  if (typeof returnTo !== 'string' || !returnTo) return null
  // Must be a root-relative path (never protocol-relative "//evil.com" or absolute).
  if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('\\')) return null
  // Reject anything that could be reinterpreted as a full URL.
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(returnTo)) return null

  // A naive string-prefix check against orgBase accepts dot-segment paths
  // (e.g. "/dashboard/org-a/../org-b/settings") and percent-encoded
  // variants ("%2e%2e") that a browser/router resolves to a path outside
  // this organization after normalization. Parse against a fixed dummy
  // origin so the URL parser collapses "." / ".." segments and decodes
  // percent-encoding the same way navigation eventually would, then
  // validate the *normalized* pathname — not the raw input string.
  let normalizedPathname: string
  try {
    const parsed = new URL(returnTo, 'https://invitation-return-to.invalid')
    if (parsed.origin !== 'https://invitation-return-to.invalid') return null
    normalizedPathname = parsed.pathname
  } catch {
    return null
  }

  const orgBase = `/dashboard/${encodeURIComponent(orgSlug)}`
  if (normalizedPathname !== orgBase && !normalizedPathname.startsWith(`${orgBase}/`)) return null

  return returnTo
}
