import { jsonResponse } from '~/server/utils/api-response'
import { listDashboardLocationsResource } from '~/server/utils/dashboard-locations-resource'

export default defineHandler(async (event) => {
  return jsonResponse(await listDashboardLocationsResource(event))
})
import { defineHandler } from 'nitro';
