import { jsonResponse } from '~/server/utils/api-response'
import {
  getDashboardContext,
  resolveSelectedDashboardLocation
} from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const { db, userId, organization, restaurant } = await getDashboardContext(event, { requireRestaurant: false })

  if (!restaurant) {
    return jsonResponse({
      success: true,
      organization,
      restaurant: null,
      locations: [],
      selectedLocation: null
    })
  }

  const { locations, selectedLocation } = await resolveSelectedDashboardLocation(
    db,
    userId,
    organization.id,
    restaurant.id
  )

  return jsonResponse({
    success: true,
    organization,
    restaurant,
    locations,
    selectedLocation
  })
})
