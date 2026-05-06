// POST create menu item
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createMenuItem } from '~/server/utils/menu-management'
import type { CreateMenuItemRequest } from '~/server/types/menu'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')
  const body = await readBody(event) as CreateMenuItemRequest
  
  if (!siteId || !menuId || !body.name || !body.section) {
    return jsonResponse({ 
      error: 'Site ID, menu ID, item name, and section are required' 
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
  const headers = getHeaders(event)
  const session = await $fetch('/api/auth/get-session', {
    headers: {
      cookie: headers.cookie || '',
      authorization: headers.authorization || ''
    }
  })
  
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
      JOIN organizations o ON s.organization_id = o.id
      JOIN organization_members om ON o.id = om.organization_id
      WHERE s.id = ? AND om.user_id = ? AND om.role IN ('owner', 'admin', 'editor')
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

    const menuItem = await createMenuItem(db, menuId, body, session.user.id)
    
    return jsonResponse({
      success: true,
      menuItem,
      siteId,
      menuId
    }, { status: 201 })
    
  } catch (error) {
    console.error('Failed to create menu item:', error)
    return jsonResponse({ 
      error: 'Failed to create menu item' 
    }, { status: 500 })
  }
})
