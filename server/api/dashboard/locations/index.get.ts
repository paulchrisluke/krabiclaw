import { jsonResponse } from '~/server/utils/api-response'
import { listDashboardLocationsResource } from '~/server/utils/dashboard-locations-resource'

export default defineEventHandler(async (event) => {
  return jsonResponse(await listDashboardLocationsResource(event))
})
