// POST create new menu
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createMenu } from '~/server/utils/menu-management'
import type { CreateMenuRequest } from '~/server/types/menu'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as CreateMenuRequest
  
  if (!siteId || !body.name) {
    return jsonResponse({ 
      error: 'Site ID and menu name are required' 
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
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Check if menu already exists for this scope
    const existingMenu = await db.prepare(`
      SELECT id FROM menus 
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
      LIMIT 1
    `).bind(site.organization_id, siteId, body.locationId || null).first()

    if (existingMenu) {
      return jsonResponse({ 
        error: 'Menu already exists for this scope' 
      }, { status: 409 })
    }

    const menu = await createMenu(db, site.organization_id, siteId, body, session.user.id)
    
    return jsonResponse({
      success: true,
      menu,
      siteId
    }, { status: 201 })
    
  } catch (error) {
    console.error('Failed to create menu:', error)
    return jsonResponse({ 
      error: 'Failed to create menu' 
    }, { status: 500 })
  }
})
