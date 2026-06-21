import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getFacebookPagesConnection } from '../../../utils/facebook-pages'
import { getDashboardContext } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const query = getQuery(event) as { siteId?: string }
  const dashboard = query.siteId ? null : await getDashboardContext(event, { requireSite: false })
  const site = query.siteId
    ? await db.prepare(`
        SELECT s.id, s.organization_id FROM sites s
        JOIN member om ON s.organization_id = om.organizationId
        WHERE s.id = ? AND om.userId = ?
        LIMIT 1
      `).bind(query.siteId, session.user.id).first<{ id: string; organization_id: string }>()
    : dashboard?.site

  if (!site) return jsonResponse({ connected: false })

  const connection = await getFacebookPagesConnection(env, site.organization_id, site.id)

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
