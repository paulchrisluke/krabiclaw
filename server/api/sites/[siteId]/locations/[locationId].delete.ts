import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { deleteLocation } from '~/server/utils/location-management'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const { env, db, session, site } = await requireSiteAccess(event, siteId, 'context')
  assertOrganizationAccess(site.member_role)
  const result = await deleteLocation(env, db, site.organization_id, siteId, locationId, session.user.id)
  if (result.status >= 400) {
    return jsonResponse(result.data, { status: result.status })
  }
  await purgeBootstrapCacheSafe(env, siteId)

  return jsonResponse({
    success: true,
    message: 'Location deleted successfully',
    siteId,
    locationId,
  }, { status: result.status })
})
