// DELETE menu
import { queryFirst } from '~/server/db'
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { deleteMenu } from '~/server/utils/menu-management'
import { assertResourceAccess } from '~/server/utils/member-access'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')
  
  if (!siteId || !menuId) {
    return jsonResponse({ 
      error: 'Site ID and menu ID are required' 
    }, { status: 400 })
  }

  try {
    const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

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
      env,
      memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: existingMenu.location_id, })

    await deleteMenu(db, site.organization_id, siteId, menuId)

    return jsonResponse({
      success: true, message: 'Menu deleted successfully', siteId, menuId
    })

  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to delete menu:', error)
    return jsonResponse({
      error: 'Failed to delete menu'
    }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
