import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { deleteLocation } from '~/server/utils/location-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const { env, db, session, site } = await requireSiteAccess(event, siteId, ['owner', 'admin'])
  const result = await deleteLocation(env, db, site.organization_id, siteId, locationId, session.user.id)
  if (result.status >= 400) {
    return jsonResponse(result.data, { status: result.status })
  }

  return jsonResponse({
    success: true,
    message: 'Location deleted successfully',
    siteId,
    locationId,
  }, { status: result.status })
})
