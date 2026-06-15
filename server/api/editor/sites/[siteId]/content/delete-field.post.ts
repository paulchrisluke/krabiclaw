// POST delete a single content field from live content
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteSiteContentField } from '~/server/utils/content-management'

interface DeleteFieldRequest {
  page: string
  field: string
  location_id?: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as DeleteFieldRequest
  const { page, field, location_id } = body

  if (!siteId || !page || !field) {
    return jsonResponse({ error: 'Site ID, page, and field are required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id
    FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member om ON o.id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const locationId = location_id || undefined

  try {
    await deleteSiteContentField(db, site.organization_id, siteId, page, field, locationId)
  } catch (err) {
    console.error('Failed to delete field:', err instanceof Error ? err.stack : String(err))
    return jsonResponse({ error: 'Failed to delete field' }, { status: 500 })
  }

  return jsonResponse({ deleted: true, page, field })
})
