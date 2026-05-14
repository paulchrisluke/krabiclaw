import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteMenuSection } from '~/server/utils/menu-management'

interface SiteRow {
  id: string
  organization_id: string
}

interface MenuRow {
  id: string
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
  const db = env.REVIEWS_DB
  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const site = await db.prepare(`
      SELECT s.id, s.organization_id
      FROM sites s
      JOIN member om ON s.organization_id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first() as SiteRow | null

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const menu = await db.prepare(`
      SELECT id
      FROM menus
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(menuId, site.organization_id, siteId).first() as MenuRow | null

    if (!menu) {
      return jsonResponse({ error: 'Menu not found' }, { status: 404 })
    }

    const deleted = await deleteMenuSection(db, menuId, section)

    if (!deleted || deleted === 0) {
      return jsonResponse({ error: 'Section not found' }, { status: 404 })
    }

    return jsonResponse({
      success: true,
      section,
      deleted
    })
  } catch (error) {
    console.error('Failed to delete menu section:', error)
    return jsonResponse({ error: 'Failed to delete menu section' }, { status: 500 })
  }
})
