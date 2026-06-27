// GET /api/editor/sites/[siteId]/blog/posts - List a tenant site's blog posts (draft + published)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listPlatformBlogPosts } from '~/server/utils/platform-content'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : undefined
  const posts = await listPlatformBlogPosts(db, status, siteId)
  return jsonResponse({ success: true, posts })
})
