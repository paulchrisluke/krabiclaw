import { jsonResponse } from '~/server/utils/api-response'
import { listDashboardLocationsResource } from '~/server/utils/dashboard-locations-resource'
import { getQuery } from 'nitro/h3'

export default defineHandler(async (event) => {
  const query = getQuery(event)
  const organizationScoped = query.organization === 'true'
  
  if (organizationScoped) {
    const { listOrganizationLocationsForDashboard } = await import('~/server/utils/dashboard-context-service')
    return jsonResponse(await listOrganizationLocationsForDashboard(event))
  }
  
  return jsonResponse(await listDashboardLocationsResource(event))
})
import { defineHandler } from 'nitro';
