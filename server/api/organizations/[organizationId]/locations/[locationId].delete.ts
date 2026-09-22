import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertRoleAllows } from '~/server/utils/member-access'
import { deleteLocation } from '~/server/utils/location-management'
import { purgePublicResourceCacheSafe } from '~/server/utils/public-resource-cache'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locationId = getRouterParam(event, 'locationId')
  if (!organizationId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const { env, db, site } = await requireSiteAccess(event, organizationId, 'context')
  await assertRoleAllows({ organizationId: site.organization_id, role: site.member_role, permissions: { locations: ['delete'] } })
  const result = await deleteLocation(env, db, site.organization_id, organizationId, locationId)
  if (result.status >= 400) {
    return jsonResponse(result.data, { status: result.status })
  }
  await purgePublicResourceCacheSafe(env, organizationId)

  return jsonResponse({
    success: true, message: 'Location deleted successfully', organizationId, locationId, }, { status: result.status })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
