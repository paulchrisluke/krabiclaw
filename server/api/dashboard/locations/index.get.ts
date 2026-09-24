import { defineHandler, HTTPError } from 'nitro'
import { getQuery } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext, listDashboardLocations } from '~/server/utils/dashboard-context'
import { listDashboardLocationsResource } from '~/server/utils/dashboard-locations-resource'

export default defineHandler(async (event) => {
  const query = getQuery(event)
  const organizationScoped = query.organization === 'true'

  if (organizationScoped) {
    const { db, organization } = await getDashboardContext(event, {
            requireOrganization: true,
    })
    if (!organization) {
      throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
    }

    const locations = await listDashboardLocations(db, organization.id)
    return jsonResponse({ success: true as const, locations })
  }

  return jsonResponse(await listDashboardLocationsResource(event))
})

