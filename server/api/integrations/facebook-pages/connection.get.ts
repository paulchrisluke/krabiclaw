import { jsonResponse } from '../../../utils/api-response'
import { getFacebookPagesConnection } from '../../../utils/facebook-pages'
import { requireRequestedLocationAccess, requireRequestedOrganizationWideAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const query = getQuery(event) as { organizationId?: string; locationId?: string }
  const { env, site } = query.locationId
    ? await requireRequestedLocationAccess(event, query.locationId, query.organizationId)
    : await requireRequestedOrganizationWideAccess(event, query.organizationId)

  const connection = await getFacebookPagesConnection(env, organization.id)

  if (!connection) {
    return jsonResponse({ connected: false })
  }

  return jsonResponse({
    connected: true, facebook_user_id: connection.facebook_user_id, page_id: connection.page_id, page_name: connection.page_name, status: connection.status, created_at: connection.created_at, })
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
