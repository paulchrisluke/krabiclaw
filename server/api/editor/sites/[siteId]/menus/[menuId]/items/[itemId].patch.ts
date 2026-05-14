// PATCH update menu item
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateMenuItem } from '~/server/utils/menu-management'
import type { UpdateMenuItemRequest } from '~/server/types/menu'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')
  const itemId = getRouterParam(event, 'itemId')
  const body = await readBody(event) as UpdateMenuItemRequest
  
  if (!siteId || !menuId || !itemId) {
    return jsonResponse({ 
      error: 'Site ID, menu ID, and item ID are required' 
    }, { status: 400 })
  }

  if (Object.keys(body).length === 0) {
    return jsonResponse({ 
      error: 'No update fields provided' 
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

    // Check if menu item exists and belongs to this menu
    const existingItem = await db.prepare(`
      SELECT id FROM menu_items 
      WHERE id = ? AND menu_id = ?
      LIMIT 1
    `).bind(itemId, menuId).first()

    if (!existingItem) {
      return jsonResponse({ 
        error: 'Menu item not found' 
      }, { status: 404 })
    }

    if (body.image_asset_id !== undefined && body.image_asset_id !== null && body.image_asset_id !== '') {
      const asset = await db.prepare(`
        SELECT id
        FROM media_assets
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `).bind(body.image_asset_id, site.organization_id, siteId).first()

      if (!asset) {
        return jsonResponse({ error: 'Invalid image_asset_id' }, { status: 400 })
      }
    }

    const menuItem = await updateMenuItem(db, itemId, body, session.user.id)
    
    return jsonResponse({
      success: true,
      menuItem,
      siteId,
      menuId,
      itemId
    })
    
  } catch (error) {
    console.error('Failed to update menu item:', error)
    return jsonResponse({ 
      error: 'Failed to update menu item' 
    }, { status: 500 })
  }
})
