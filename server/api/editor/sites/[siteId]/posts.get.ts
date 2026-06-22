import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listPosts } from '~/server/utils/post-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const query = getQuery(event)
  const status = query.status as string | undefined
  const locationId = typeof query.location_id === 'string' ? query.location_id : undefined
  const posts = await listPosts(db, site.organization_id, siteId, status, locationId)
  return jsonResponse({ success: true, posts })
})
