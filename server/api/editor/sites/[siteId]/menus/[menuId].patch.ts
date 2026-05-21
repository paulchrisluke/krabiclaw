// PATCH update menu
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateMenu } from '~/server/utils/menu-management'
import type { UpdateMenuRequest } from '~/server/types/menu'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')
  const body = await readBody(event) as UpdateMenuRequest
  
  if (!siteId || !menuId) {
    return jsonResponse({ 
      error: 'Site ID and menu ID are required' 
    }, { status: 400 })
  }

  if (Object.keys(body).length === 0) {
    return jsonResponse({ 
      error: 'No update fields provided' 
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  
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
      SELECT s.id, s.organization_id, s.status, s.onboarding_status
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null }>()
    
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

    const menu = await updateMenu(db, site.organization_id, siteId, menuId, body, session.user.id)
    
    return jsonResponse({
      success: true,
      menu,
      siteId,
      menuId
    })
    
  } catch (error) {
    console.error('Failed to update menu:', error)
    return jsonResponse({ 
      error: 'Failed to update menu' 
    }, { status: 500 })
  }
})
