// Shared registry for dashboard deep-links, used by both the client/tenant
// MCP (server/utils/mcp-executor.ts) and ChowBot's own tool executor
// (server/utils/chowbot-agent.ts) — two otherwise-separate tool-calling
// implementations that should still produce identical dashboard URLs.
export const DASHBOARD_DESTINATIONS = {
  'settings.general': 'settings/general',
  'settings.analytics': 'settings/analytics',
  'settings.billing': 'settings/billing',
  'settings.members': 'settings/members',
  'settings.chatgpt': 'settings/chatgpt',
  'site.overview': 'sites/:siteSlug',
  'site.locations': 'sites/:siteSlug/locations',
  'site.locations.new': 'sites/:siteSlug/locations/new',
  'site.domains': 'sites/:siteSlug/domains',
  'site.settings': 'sites/:siteSlug/settings',
  'location.overview': 'sites/:siteSlug/locations/:locationSlug',
  'location.settings': 'sites/:siteSlug/locations/:locationSlug/settings',
  support: 'support',
} as const

export type DashboardDestination = keyof typeof DASHBOARD_DESTINATIONS

export interface DashboardLinkOrgContext {
  env: { NUXT_PUBLIC_PLATFORM_DOMAIN?: string }
  organizationId: string
  organizationSlug?: string
  siteSlug?: string | null
  subdomain?: string | null
  locationSlug?: string | null
}

export function buildDashboardUrl(site: DashboardLinkOrgContext, destination: DashboardDestination): string {
  const platformDomain = site.env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'https://krabiclaw.com'
  const orgSlug = site.organizationSlug || site.organizationId
  const siteSlug = site.siteSlug ?? site.subdomain ?? null
  const path = DASHBOARD_DESTINATIONS[destination]
    .replace(/^\/+/, '')
    .replaceAll(':siteSlug', siteSlug || '')
    .replaceAll(':locationSlug', site.locationSlug || '')
  if (path.includes('//') || path.endsWith('/')) {
    throw new Error(`Dashboard destination ${destination} requires explicit site/location context`)
  }
  return `${platformDomain}/dashboard/${orgSlug}/${path}`
}
