import { jsonResponse } from '~/server/utils/api-response'
import {
  getDashboardContext,
  listOrganizationSites,
  resolveSelectedDashboardLocation
} from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  // afterTransfer: opt-in for the post-transfer onboarding page, which has no
  // siteSlug route segment to attach a header from and needs to resolve the
  // specific site this user just received — see resolveRecentlyTransferredSite.
  const afterTransfer = getQuery(event).afterTransfer === 'true'
  const { db, userId, organization, site } = await getDashboardContext(event, {
    requireSite: false,
    allowTransferFallback: afterTransfer,
  })
  const sites = await listOrganizationSites(db, organization.id)

  if (!site) {
    return jsonResponse({
      success: true,
      organization,
      site: null,
      sites,
      locations: [],
      selectedLocation: null
    })
  }

  const { locations, selectedLocation } = await resolveSelectedDashboardLocation(
    db,
    userId,
    organization.id,
    site.id
  )

  return jsonResponse({
    success: true,
    organization,
    site,
    sites,
    locations,
    selectedLocation
  })
})
