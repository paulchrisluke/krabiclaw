import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteMenuSection, MenuNotFoundError } from '~/server/utils/menu-management'
import { assertResourceAccess } from '~/server/utils/member-access'

interface SiteRow {
  id: string
  organization_id: string
  member_id: string
  member_role: string
}

interface MenuRow {
  id: string
  location_id: string | null
}

export default defineEventHandler(async (event) => {
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

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const site = await queryFirst<SiteRow>(db, `
      SELECT s.id, s.organization_id, om.id AS member_id, om.role AS member_role
      FROM sites s
      JOIN member om ON s.organization_id = om.organizationId
      WHERE s.id = ? AND om.userId = ?
      LIMIT 1
    `, [siteId, session.user.id])

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

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
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: menu.location_id,
    })

    const deleted = await deleteMenuSection(db, site.organization_id, siteId, menuId, section)

    if (!deleted || deleted === 0) {
      return jsonResponse({ error: 'Section not found' }, { status: 404 })
    }

    return jsonResponse({
      success: true,
      section,
      deleted
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
