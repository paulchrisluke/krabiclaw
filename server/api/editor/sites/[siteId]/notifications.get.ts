import { jsonResponse } from '~/server/utils/api-response'
import { getNotificationsSettings } from '~/server/utils/mcp-workflows'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId)

  const notifications = await getNotificationsSettings(db, site.organization_id, siteId)
  return jsonResponse({ success: true, notifications })
})
