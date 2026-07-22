// POST create new menu
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { createMenu } from '~/server/utils/menu-management'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
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
    const site = await loadMemberSiteRow(db, siteId, session.user.id)

    if (!site) {
      return jsonResponse({
        error: 'Site not found or access denied'
      }, { status: 404 })
    }

    const targetLocationId = body.locationId || null
    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: targetLocationId,
    })

    // Check if menu already exists for this scope
    const existingMenu = await queryFirst(db, `
      SELECT id FROM menus
      WHERE organization_id = ? AND site_id = ? AND location_id = ?
      LIMIT 1
    `, [site.organization_id, siteId, body.locationId || null])

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
    rethrowHttpError(error)
    console.error('Failed to create menu:', error)
    return jsonResponse({
      error: 'Failed to create menu'
    }, { status: 500 })
  }
})
