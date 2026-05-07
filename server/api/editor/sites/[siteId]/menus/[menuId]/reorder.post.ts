// POST reorder menu items
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { reorderMenuItems } from '~/server/utils/menu-management'
import type { ReorderMenuItemsRequest } from '~/server/types/menu'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')
  const body = await readBody(event) as ReorderMenuItemsRequest
  
  if (!siteId || !menuId || !body.items || !Array.isArray(body.items)) {
    return jsonResponse({ 
      error: 'Site ID, menu ID, and items array are required' 
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Verify user belongs to organization that owns the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.name, s.status, s.onboarding_status
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Check if menu exists and belongs to this site
    const existingMenu = await db.prepare(`
      SELECT id FROM menus 
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(menuId, site.organization_id, siteId).first()

    if (!existingMenu) {
      return jsonResponse({ 
        error: 'Menu not found' 
      }, { status: 404 })
    }

    // Validate that all items belong to this menu
    const itemIds = body.items.map(item => item.id)
    const existingItems = await db.prepare(`
      SELECT id FROM menu_items 
      WHERE id IN (${itemIds.map(() => '?').join(',')}) AND menu_id = ?
    `).bind(...itemIds, menuId).all()

    if (existingItems.results.length !== itemIds.length) {
      return jsonResponse({ 
        error: 'Some menu items not found or do not belong to this menu' 
      }, { status: 404 })
    }

    await reorderMenuItems(db, menuId, body.items)
    
    return jsonResponse({
      success: true,
      message: 'Menu items reordered successfully',
      siteId,
      menuId
    })
    
  } catch (error) {
    console.error('Failed to reorder menu items:', error)
    return jsonResponse({ 
      error: 'Failed to reorder menu items' 
    }, { status: 500 })
  }
})
