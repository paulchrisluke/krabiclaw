// GET /api/public/sites/[siteId]/menu-items/[slug] - Get single public menu item
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublicMenuItem } from '~/server/utils/menu-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  
  if (!siteId || !slug) {
    return jsonResponse({ 
       error: 'Site ID and Slug are required' 
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Validate site is active
    const site = await db.prepare(
      `SELECT status, default_currency FROM sites WHERE id = ? LIMIT 1`
    ).bind(siteId).first<{ status: string; default_currency: string | null }>()
    if (!site || site.status !== 'active') {
      return jsonResponse({ error: 'Menu item not found' }, { status: 404 })
    }

    const item = await getPublicMenuItem(db, siteId, slug)
    
    if (!item) {
      return jsonResponse({ 
        error: 'Menu item not found' 
      }, { status: 404 })
    }

    return jsonResponse({
      success: true,
      item,
      currency: site.default_currency || 'THB'
    })
    
  } catch (error) {
    console.error('Failed to get public menu item:', error)
    return jsonResponse({ 
      error: 'Failed to get menu item' 
    }, { status: 500 })
  }
})
