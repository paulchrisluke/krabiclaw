import type { H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  getDashboardContext,
  listOrganizationSites,
  listDashboardLocations,
} from '~/server/utils/dashboard-context'
import { isManagedServiceEnabled } from '~/server/utils/feature-flags'
import { resolveDashboardSiteAccess } from '~/server/utils/member-access'

export async function loadDashboardContext(
  event: H3Event,
  scope?: { orgSlug?: string | null; siteSlug?: string | null; afterTransfer?: boolean },
) {
  const managedServiceEnabled = isManagedServiceEnabled(cloudflareEnv(event))
  const { db, organization, site } = await getDashboardContext(event, {
    requireSite: false,
    requireOrganization: scope?.orgSlug ? true : false,
    allowTransferFallback: scope?.afterTransfer,
    organizationSlug: scope?.orgSlug,
    siteSlug: scope?.siteSlug,
  })

  if (!organization) {
    // If an organization slug was explicitly requested but not found,
    // that's an error, not a fallback to null.
    if (scope?.orgSlug) {
      throw createError({ statusCode: 404, statusMessage: `Organization not found: ${scope.orgSlug}` })
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

  const principal = { memberId: organization.memberId, role: organization.role }
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

  const [locations, siteAccess] = await Promise.all([
    listDashboardLocations(db, organization.id, site.id, principal),
    resolveDashboardSiteAccess(db, {
      ...principal,
      organizationId: organization.id,
      siteId: site.id,
    }),
  ])
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
