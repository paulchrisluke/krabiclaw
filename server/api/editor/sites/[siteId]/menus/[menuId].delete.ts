// DELETE menu
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteMenu } from '~/server/utils/menu-management'
import { assertResourceAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')
  
  if (!siteId || !menuId) {
    return jsonResponse({ 
      error: 'Site ID and menu ID are required' 
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
    // Verify user belongs to organization that owns this site.
    const site = await queryFirst<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null; member_id: string; member_role: string }>(db, `
      SELECT s.id, s.organization_id, s.status, s.onboarding_status, om.id AS member_id, om.role AS member_role
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ?
      LIMIT 1
    `, [siteId, session.user.id])

    if (!site) {
      return jsonResponse({
        error: 'Site not found or access denied'
      }, { status: 404 })
    }

    // Check if menu exists and belongs to this site
    const existingMenu = await queryFirst<{ id: string; location_id: string | null }>(db, `
      SELECT id, location_id FROM menus
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `, [menuId, site.organization_id, siteId])

    if (!existingMenu) {
      return jsonResponse({
        error: 'Menu not found'
      }, { status: 404 })
    }

    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: existingMenu.location_id,
    })

    await deleteMenu(db, site.organization_id, siteId, menuId)

    return jsonResponse({
      success: true,
      message: 'Menu deleted successfully',
      siteId,
      menuId
    })

  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to delete menu:', error)
    return jsonResponse({
      error: 'Failed to delete menu'
    }, { status: 500 })
  }
})
