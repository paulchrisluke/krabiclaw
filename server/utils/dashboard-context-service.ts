import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  getDashboardContext,
  listOrganizationSites,
  listDashboardLocations,
} from '~/server/utils/dashboard-context'
import { isManagedServiceEnabled } from '~/server/utils/feature-flags'
import { isOrganizationWideRole, listUserOrganizationTeamIds, resolveDashboardSiteAccess } from '~/server/utils/member-access'
import { recordRequestPhase } from '~/server/utils/request-metrics'

export async function loadDashboardContext(
  event: H3Event,
  scope?: { orgSlug?: string | null; siteId?: string | null; siteSlug?: string | null; afterTransfer?: boolean },
) {
  const contextStartedAt = performance.now()
  const env = cloudflareEnv(event)
  const managedServiceEnabled = isManagedServiceEnabled(env)
  const { db, organization, site, userId } = await getDashboardContext(event, {
    requireSite: false,
    requireOrganization: scope?.orgSlug ? true : false,
    allowTransferFallback: scope?.afterTransfer,
    organizationSlug: scope?.orgSlug,
    siteId: scope?.siteId,
    siteSlug: scope?.siteSlug,
    // This function is the canonical /api/dashboard/context payload loader —
    // called directly by that route's own handler (where event.path already
    // matches) and, for SSR, by useDashboardSite's refresh() using the page's
    // own event (see the pathname doc on DashboardContextOptions). Pinning
    // the logical path here keeps the scoped-role allowlist check correct
    // for both callers instead of only the former.
    pathname: '/api/dashboard/context',
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
      managedServiceEnabled,
    }
  }

  const teamIds = isOrganizationWideRole(organization.role)
    ? null
    : await listUserOrganizationTeamIds({ env: cloudflareEnv(event), organizationId: organization.id, userId })
  const principal = { env, memberId: organization.memberId, role: organization.role, teamIds }
  const sites = await listOrganizationSites(db, organization.id, principal)
  if (!site) {
    return {
      success: true as const,
      organization,
      site: null,
      sites,
      locations: [],
      siteAccess: null,
      managedServiceEnabled,
    }
  }

  const resourcesStartedAt = performance.now()
  const [locations, siteAccess] = await Promise.all([
    listDashboardLocations(db, organization.id, site.id, principal),
    resolveDashboardSiteAccess(db, {
      ...principal,
      organizationId: organization.id,
      siteId: site.id,
    }),
  ])
  recordRequestPhase(event, 'resources', resourcesStartedAt)
  return {
    success: true as const,
    organization,
    site,
    sites,
    locations,
    siteAccess,
    managedServiceEnabled,
  }
}
