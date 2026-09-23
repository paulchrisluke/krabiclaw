// Shared registry for dashboard deep-links, used by both the client/tenant
// MCP (server/utils/mcp-executor.ts) and ChowBot's own tool executor
// (server/utils/chowbot-agent.ts) — two otherwise-separate tool-calling
// implementations that should still produce identical dashboard URLs.
export const DASHBOARD_DESTINATIONS = {
  'settings.billing': 'settings/billing',
  'settings.members': 'settings/members',
  'organization.overview': '',
  'organization.locations.new': 'locations/new',
  'organization.domains': 'settings/website/domains',
  'organization.settings': 'settings',
  'location.overview': 'locations/:locationSlug',
  'location.settings': 'locations/:locationSlug/settings',
  support: 'support',
} as const

export type DashboardDestination = keyof typeof DASHBOARD_DESTINATIONS

export interface DashboardLinkOrgContext {
  env: { NUXT_PUBLIC_PLATFORM_DOMAIN?: string }
  organizationId: string
  organizationSlug?: string
  locationSlug?: string | null
}

function requiredDashboardSegment(
  value: string | null | undefined,
  label: 'organizationSlug' | 'locationSlug',
  destination: DashboardDestination,
): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    throw new Error(`Dashboard destination ${destination} requires explicit ${label} context`)
  }
  return encodeURIComponent(trimmed)
}

export function buildDashboardUrl(organization: DashboardLinkOrgContext, destination: DashboardDestination): string {
  const platformDomain = organization.env.NUXT_PUBLIC_PLATFORM_DOMAIN
  if (!platformDomain) throw new Error('NUXT_PUBLIC_PLATFORM_DOMAIN is required')
  const orgSlug = requiredDashboardSegment(organization.organizationSlug, 'organizationSlug', destination)
  const path = DASHBOARD_DESTINATIONS[destination]
    .replace(/^\/+/, '')
    .replaceAll(':locationSlug', pathRequiresLocationSlug(destination) ? requiredDashboardSegment(organization.locationSlug ?? null, 'locationSlug', destination) : '')
  if (path.includes('//') || path.endsWith('/')) {
    throw new Error(`Dashboard destination ${destination} requires explicit location context`)
  }
  // The organization root is the dashboard's own path, with nothing under it.
  return path ? `${platformDomain}/dashboard/${orgSlug}/${path}` : `${platformDomain}/dashboard/${orgSlug}`
}

function pathRequiresLocationSlug(destination: DashboardDestination): boolean {
  return DASHBOARD_DESTINATIONS[destination].includes(':locationSlug')
}
