// GET menus for site with optional location filter
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getMenus } from '~/server/utils/menu-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getQuery(event).locationId as string | undefined
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
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
      WHERE s.id = ? AND om.userId = ? AND (
        om.role = 'owner' OR om.role = 'admin' OR om.role = 'editor'
      )
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    const menus = await getMenus(db, site.organization_id, siteId, locationId)
    
    return jsonResponse({
      success: true,
      menus,
      siteId,
      locationId
    })
    
  } catch (error) {
    console.error('Failed to get menus:', error)
    return jsonResponse({ 
      error: 'Failed to get menus' 
    }, { status: 500 })
  }
})
