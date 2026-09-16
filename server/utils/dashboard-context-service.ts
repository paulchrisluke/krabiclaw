import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  decorateDashboardSiteCard,
  getDashboardContext,
  listOrganizationSites,
  listDashboardLocations,
  loadDashboardSiteCardEnrichment,
} from '~/server/utils/dashboard-context'
import { isOrganizationWideRole, listUserOrganizationTeamIds, resolveDashboardSiteAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { recordRequestPhase } from '~/server/utils/request-metrics'

export async function loadDashboardContext(
  event: H3Event,
  scope?: { orgSlug?: string | null; siteId?: string | null; siteSlug?: string | null },
) {
  const contextStartedAt = performance.now()
  const env = cloudflareEnv(event)
  const { db, organization, site, userId } = await getDashboardContext(event, {
    requireSite: false,
    requireOrganization: scope?.orgSlug ? true : false,
    organizationSlug: scope?.orgSlug,
    siteId: scope?.siteId,
    siteSlug: scope?.siteSlug,
    // This function is the canonical /api/dashboard/context payload loader —
    // called directly by that route's own handler (where event.path already
    // matches) and, for SSR, by useDashboardSite's refresh() using the page's
    // own event (see the pathname doc on DashboardContextOptions). Pinning
    // the logical path here keeps the scoped-role allowlist check correct
    // for both callers instead of only the former.
  })
  recordRequestPhase(event, 'context', contextStartedAt)

  if (!organization) {
    // If an organization slug was explicitly requested but not found,
    // that's an error, not a fallback to null.
    if (scope?.orgSlug) {
      throw new HTTPError({ statusCode: 404, statusMessage: `Organization not found: ${scope.orgSlug}` })
    }
    return {
      success: true as const,
      organization: null,
      site: null,
      sites: [],
      locations: [],
      siteAccess: null,
    }
  }

  const teamIds = isOrganizationWideRole(organization.role)
    ? null
    : await listUserOrganizationTeamIds({ env: cloudflareEnv(event), organizationId: organization.id, userId })
  const principal = { env, userId, role: organization.role, teamIds }

  // This payload draws the site switcher and the selected site's card, so it is
  // the one surface that needs the organization plan and the site-card media.
  // Both are organization-wide, so both are read once here and shared by the
  // list and the selected site. Loading them inside the context resolver and
  // again inside the sites list is what made a selected-site bootstrap pay for
  // each of them twice.
  const [siteRows, enrichment] = await Promise.all([
    listOrganizationSites(db, organization.id, principal),
    loadDashboardSiteCardEnrichment(env, db, organization.id),
  ])
  const sites = siteRows.map(row => decorateDashboardSiteCard(row, enrichment))
  if (!site) {
    return {
      success: true as const,
      organization,
      site: null,
      sites,
      locations: [],
      siteAccess: null,
    }
  }
  const selectedSite = decorateDashboardSiteCard(site, enrichment)

  const resourcesStartedAt = performance.now()
  const [locations, siteAccess] = await Promise.all([
    listDashboardLocations(db, organization.id, site.id, principal),
    resolveDashboardSiteAccess(db, memberAccessPrincipal(organization, { env, siteId: site.id })),
  ])
  recordRequestPhase(event, 'resources', resourcesStartedAt)
  return {
    success: true as const,
    organization,
    site: selectedSite,
    sites,
    locations,
    siteAccess,
  }
}
