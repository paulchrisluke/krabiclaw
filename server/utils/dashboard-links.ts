// Shared registry for dashboard deep-links, used by both the client/tenant
// MCP (server/utils/mcp-executor.ts) and ChowBot's own tool executor
// (server/utils/chowbot-agent.ts) — two otherwise-separate tool-calling
// implementations that should still produce identical dashboard URLs.
// Every destination here is org-scoped (`/dashboard/{orgSlug}/...`) because
// that's all either caller can resolve without an extra DB lookup — site- or
// location-scoped destinations need the site's `subdomain` slug, not its id,
// and can be added once a tool actually needs one.

export const DASHBOARD_DESTINATIONS = {
  'settings.general': 'settings/general',
  'settings.domains': 'settings/domains',
  'settings.billing': 'settings/billing',
  'settings.members': 'settings/members',
  support: 'support',
} as const

export type DashboardDestination = keyof typeof DASHBOARD_DESTINATIONS

export interface DashboardLinkOrgContext {
  env: { NUXT_PUBLIC_PLATFORM_DOMAIN?: string }
  organizationId: string
  organizationSlug?: string
}

export function buildDashboardUrl(site: DashboardLinkOrgContext, destination: DashboardDestination): string {
  const platformDomain = site.env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'https://krabiclaw.com'
  const orgSlug = site.organizationSlug || site.organizationId
  const path = DASHBOARD_DESTINATIONS[destination].replace(/^\/+/, '')
  return `${platformDomain}/dashboard/${orgSlug}/${path}`
}
