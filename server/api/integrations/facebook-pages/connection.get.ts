import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getFacebookPagesConnection } from '../../../utils/facebook-pages'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const query = getQuery(event) as { siteId?: string }
  const siteId = query.siteId
  if (!siteId) return jsonResponse({ error: 'siteId is required' }, { status: 400 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ?
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const connection = await getFacebookPagesConnection(env, site.organization_id, siteId)

  if (!connection) {
    return jsonResponse({ connected: false })
  }

  return jsonResponse({
    connected: true,
    facebook_user_id: connection.facebook_user_id,
    facebook_page_id: connection.facebook_page_id,
    facebook_page_name: connection.facebook_page_name,
    status: connection.status,
    created_at: connection.created_at,
  })
})
