import { jsonResponse } from '../../../utils/api-response'
import { getFacebookPagesConnection } from '../../../utils/facebook-pages'
import { requireRequestedLocationAccess, requireRequestedSiteWideAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { siteId?: string; locationId?: string }
  const { env, site } = query.locationId
    ? await requireRequestedLocationAccess(event, query.locationId, query.siteId)
    : await requireRequestedSiteWideAccess(event, query.siteId)

  const connection = await getFacebookPagesConnection(env, site.organization_id, site.id)

  if (!connection) {
    return jsonResponse({ connected: false })
  }

  return jsonResponse({
    connected: true,
    facebook_user_id: connection.facebook_user_id,
    facebook_page_id: connection.facebook_page_id,
    facebook_page_name: connection.facebook_page_name,
    status: connection.status,
    created_at: connection.created_at,
  })
})
