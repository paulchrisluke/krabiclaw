import { environmentTenantAliasHostname, normalizeHost } from '~/server/utils/tenant-hosts'

/**
 * Where a site lives, from the browser's point of view.
 *
 * Production and local development address a site as `<subdomain>.<free site
 * domain>`. Preview and staging cannot: their free-site domain is the
 * production one, and Cloudflare's universal certificate does not cover a
 * second-level wildcard, so those environments give every tenant a first-level
 * alias instead — `<subdomain>-preview.krabiclaw.com`. Building the host by
 * hand gets this wrong in exactly the way that makes a preview frame the
 * production site, so every surface that needs a site's origin (the onboarding
 * pane, the page editor's preview, the dashboard's live-site links) calls this.
 */
export function tenantSiteOrigin(input: {
  platformDomain: string
  freeSiteDomain: string
  subdomain: string
}): string {
  const subdomain = input.subdomain.trim().toLowerCase()
  if (!subdomain) return ''

  const freeSiteHost = input.freeSiteDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!freeSiteHost) return ''
  const protocol = input.freeSiteDomain.startsWith('http://') ? 'http:' : 'https:'

  // Deployed preview and staging: a first-level alias off the production root.
  // normalizeHost first: environmentTenantAliasHostname takes a hostname, and
  // a configured value is a full URL.
  const alias = environmentTenantAliasHostname(normalizeHost(input.platformDomain), subdomain)
  if (alias) return `${protocol}//${alias}`

  return `${protocol}//${subdomain}.${freeSiteHost}`
}
