import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  dashboardOrgQueryParam,
  dashboardSiteQueryParam,
  decorateDashboardSiteCard,
  getDashboardContext,
  listOrganizationSites,
  listDashboardLocations,
  loadDashboardSiteCardEnrichment,
} from '~/server/utils/dashboard-context'
import { isOrganizationWideRole, listUserOrganizationTeamIds, resolveDashboardSiteAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { recordRequestPhase } from '~/server/utils/request-metrics'

// The scope is the route's `org`/`site` query params. No organization is a
// 400 and one this session cannot see is a 404 (getDashboardContext); a site
// the organization does not have is a 404 here. None of them is a payload with
// nulls in it: the dashboard rendered that payload as "Site not found" on the
// client while the server had logged a 200.
export async function loadDashboardContext(
  event: H3Event,
  scope: { orgSlug: string | null; siteSlug: string | null } = {
    orgSlug: dashboardOrgQueryParam(event),
    siteSlug: dashboardSiteQueryParam(event),
  },
) {
  const contextStartedAt = performance.now()
  const env = cloudflareEnv(event)
  const { db, organization, site, userId } = await getDashboardContext(event, {
    requireSite: false,
    organizationSlug: scope.orgSlug,
    siteSlug: scope.siteSlug,
  })
  recordRequestPhase(event, 'context', contextStartedAt)

  const teamIds = isOrganizationWideRole(organization.role)
    ? null
    : await listUserOrganizationTeamIds({ env: cloudflareEnv(event), organizationId: organization.id, userId, event })
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
    if (scope.siteSlug) {
      throw new HTTPError({ statusCode: 404, statusMessage: `Site not found: ${scope.siteSlug}` })
    }
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
    listDashboardLocations(db, organization.id, site.id, principal, false),
    resolveDashboardSiteAccess(db, memberAccessPrincipal(organization, { env, siteId: site.id, event })),
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

