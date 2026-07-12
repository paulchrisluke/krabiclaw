import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db } = await requireSiteAccess(event, siteId)
  
  const pages = await db.prepare(`
    SELECT path, title
    FROM tenant_pages
    WHERE site_id = ? AND status = 'published'
    ORDER BY sort_order ASC, title ASC
  `).bind(siteId).all()
  
  return jsonResponse(pages.results ?? [])
})
