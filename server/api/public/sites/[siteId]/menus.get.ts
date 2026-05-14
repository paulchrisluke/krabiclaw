// GET public menu for site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getActiveMenu } from '~/server/utils/menu-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getQuery(event).locationId as string | undefined
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Get site and organization info
    const site = await db.prepare(`
      SELECT id, organization_id, name, status
      FROM sites 
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `).bind(siteId).first<{ id: string; organization_id: string; name: string; status: string }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or inactive' 
      }, { status: 404 })
    }

    const menu = await getActiveMenu(db, site.organization_id, siteId, locationId)
    
    if (!menu) {
      return jsonResponse({
        success: true,
        menu: null,
        message: 'No menu available for this scope',
        siteId,
        locationId
      })
    }

    return jsonResponse({
      success: true,
      menu,
      siteId,
      locationId
    })
    
  } catch (error) {
    console.error('Failed to get public menu:', error)
    return jsonResponse({ 
      error: 'Failed to get menu' 
    }, { status: 500 })
  }
})
