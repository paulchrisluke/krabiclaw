import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db } = await requireSiteAccess(event, siteId)
  
  const scopes = await db.prepare(`
    SELECT DISTINCT page_path
    FROM site_qa
    WHERE site_id = ? AND location_id IS NULL AND page_path IS NOT NULL
    ORDER BY page_path ASC
  `).bind(siteId).all()
  
  return jsonResponse(scopes.results ?? [])
})
