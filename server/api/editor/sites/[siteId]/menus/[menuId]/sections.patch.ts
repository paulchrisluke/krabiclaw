// PATCH rename menu section
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { MenuSectionConflictError, MenuSectionNotFoundError, renameMenuSection } from '~/server/utils/menu-management'

interface RenameSectionBody {
  old_section?: string
  new_section?: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')

  if (!siteId || !menuId) {
    return jsonResponse({ error: 'Site ID and menu ID are required' }, { status: 400 })
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
    const body = await readBody(event) as RenameSectionBody
    const oldSection = body.old_section?.trim()
    const newSection = body.new_section?.trim()

    if (!oldSection || !newSection) {
      return jsonResponse({ error: 'Old section and new section are required' }, { status: 400 })
    }
    if (oldSection === newSection) {
      return jsonResponse({ error: 'New section must be different' }, { status: 400 })
    }

    const site = await queryFirst<{ id: string; organization_id: string }>(db, `
      SELECT s.id, s.organization_id
      FROM sites s
      JOIN member om ON s.organization_id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `, [siteId, session.user.id])

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const menu = await queryFirst(db, `
      SELECT id FROM menus
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `, [menuId, site.organization_id, siteId])

    if (!menu) {
      return jsonResponse({ error: 'Menu not found' }, { status: 404 })
    }

    const updated = await renameMenuSection(db, menuId, oldSection, newSection, session.user.id)

    return jsonResponse({
      success: true,
      menuId,
      old_section: oldSection,
      new_section: newSection,
      updated,
    })
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
    }
    if (error instanceof MenuSectionNotFoundError) {
      return jsonResponse({ error: 'Section not found' }, { status: 404 })
    }
    if (error instanceof MenuSectionConflictError) {
      return jsonResponse({ error: 'Section already exists' }, { status: 409 })
    }
    console.error('Failed to rename menu section:', error)
    return jsonResponse({ error: 'Failed to rename menu section' }, { status: 500 })
  }
})
