import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  getDashboardContext,
  listOrganizationSites,
  listDashboardLocations
} from '~/server/utils/dashboard-context'
import { isManagedServiceEnabled } from '~/server/utils/feature-flags'
import { resolveDashboardSiteAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const managedServiceEnabled = isManagedServiceEnabled(cloudflareEnv(event))

  // afterTransfer: opt-in for the post-transfer onboarding page, which has no
  // siteSlug route segment to attach a header from and needs to resolve the
  // specific site this user just received — see resolveRecentlyTransferredSite.
  const afterTransfer = getQuery(event).afterTransfer === 'true'
  const { db, organization, site } = await getDashboardContext(event, {
    requireSite: false,
    requireOrganization: false,
    allowTransferFallback: afterTransfer,
  })

  // No organization yet is a normal state for a brand-new user who hasn't
  // created or joined one — signup no longer auto-creates a personal org.
  if (!organization) {
    return jsonResponse({
      success: true,
      organization: null,
      site: null,
      sites: [],
      locations: [],
      siteAccess: null,
      managedServiceEnabled
    })
  }

  const principal = { memberId: organization.memberId, role: organization.role }
  const sites = await listOrganizationSites(db, organization.id, principal)

  if (!site) {
    return jsonResponse({
      success: true,
      organization,
      site: null,
      sites,
      locations: [],
      siteAccess: null,
      managedServiceEnabled
    })
  }

  const locations = await listDashboardLocations(db, organization.id, site.id, principal)
  const siteAccess = await resolveDashboardSiteAccess(db, {
    ...principal,
    organizationId: organization.id,
    siteId: site.id,
  })

  return jsonResponse({
    success: true,
    organization,
    site,
    sites,
    locations,
    siteAccess,
    managedServiceEnabled
  })
})
