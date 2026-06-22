import { jsonResponse } from '~/server/utils/api-response'
import {
  getDashboardContext,
  listOrganizationSites,
  resolveSelectedDashboardLocation
} from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const { db, userId, organization, site } = await getDashboardContext(event, { requireSite: false })
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
