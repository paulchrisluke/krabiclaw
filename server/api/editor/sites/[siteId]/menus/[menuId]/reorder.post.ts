// POST reorder menu items
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { MenuNotFoundError, reorderMenuItems } from '~/server/utils/menu-management'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
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

    // Validate that all items belong to this menu
    const itemIds = body.items.map(item => item.id)
    if (itemIds.length === 0) {
      return jsonResponse({
        error: 'Items array must not be empty'
      }, { status: 400 })
    }

    const existingItems = await queryAll(db, `
      SELECT id FROM menu_items
      WHERE id IN (${itemIds.map(() => '?').join(',')}) AND menu_id = ?
    `, [...itemIds, menuId])

    if (existingItems.length !== itemIds.length) {
      return jsonResponse({
        error: 'Some menu items not found or do not belong to this menu'
      }, { status: 404 })
    }

    await reorderMenuItems(db, site.organization_id, siteId, menuId, body.items)
    
    return jsonResponse({
      success: true,
      message: 'Menu items reordered successfully',
      siteId,
      menuId
    })
    
  } catch (error) {
    rethrowHttpError(error)
    if (error instanceof MenuNotFoundError) {
      return jsonResponse({ error: 'Menu not found' }, { status: 404 })
    }
    console.error('Failed to reorder menu items:', error)
    return jsonResponse({
      error: 'Failed to reorder menu items'
    }, { status: 500 })
  }
})
