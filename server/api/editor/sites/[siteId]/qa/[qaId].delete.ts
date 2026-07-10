import { jsonResponse } from '~/server/utils/api-response'
import { deleteQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const qaId = getRouterParam(event, 'qaId')
  if (!siteId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })
  const { db, site } = await requireSiteAccess(event, siteId)
  const result = await deleteQa(db, { organizationId: site.organization_id, siteId, locationId: null }, qaId)
  return jsonResponse(result.data, { status: result.status })
})
