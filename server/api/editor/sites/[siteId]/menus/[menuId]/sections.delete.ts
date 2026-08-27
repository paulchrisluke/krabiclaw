import { queryFirst } from '~/server/db'
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { deleteMenuSection, MenuNotFoundError } from '~/server/utils/menu-management'
import { assertResourceAccess } from '~/server/utils/member-access'
import { requireSiteAccess } from '~/server/utils/location-access'

interface MenuRow {
  id: string
  location_id: string | null
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')
  const query = getQuery(event)

  if (!siteId || !menuId) {
    return jsonResponse({ error: 'Site ID and menu ID are required' }, { status: 400 })
  }

  const rawSection = Array.isArray(query.section) ? query.section[0] : query.section
  const section = typeof rawSection === 'string' ? rawSection.trim() : ''
  if (!section) {
    return jsonResponse({ error: 'Section is required' }, { status: 400 })
  }

  try {
    const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

    const menu = await queryFirst<MenuRow>(db, `
      SELECT id, location_id
      FROM menus
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `, [menuId, site.organization_id, siteId])

    if (!menu) {
      return jsonResponse({ error: 'Menu not found' }, { status: 404 })
    }

    await assertResourceAccess(db, {
      env,
      memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: menu.location_id, })

    const deleted = await deleteMenuSection(db, site.organization_id, siteId, menuId, section)

    if (!deleted || deleted === 0) {
      return jsonResponse({ error: 'Section not found' }, { status: 404 })
    }

    return jsonResponse({
      success: true, section, deleted
    })
  } catch (error) {
    rethrowHttpError(error)
    if (error instanceof MenuNotFoundError) {
      return jsonResponse({ error: 'Menu not found' }, { status: 404 })
    }
    console.error('Failed to delete menu section:', error)
    return jsonResponse({ error: 'Failed to delete menu section' }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
