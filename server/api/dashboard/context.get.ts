import { jsonResponse } from '~/server/utils/api-response'
import {
  getDashboardContext,
  resolveSelectedDashboardLocation
} from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const { db, userId, organization, site } = await getDashboardContext(event, { requireSite: false })

  if (!site) {
    return jsonResponse({
      success: true,
      organization,
      site: null,
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
    locations,
    selectedLocation
  })
})
