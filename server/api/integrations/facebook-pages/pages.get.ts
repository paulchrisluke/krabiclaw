import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getFacebookPagesConnection, getFacebookPages } from '../../../utils/facebook-pages'
import { getDashboardContext } from '~/server/utils/dashboard-context'

// Returns the list of Facebook Pages accessible on the stored connection.
// Used in the dashboard so the user can pick which page to link to each location.
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
        WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
        LIMIT 1
      `).bind(query.siteId, session.user.id).first<{ id: string; organization_id: string }>()
    : dashboard?.site

  if (!site) return jsonResponse({ pages: [], connected_page_id: null })

  const connection = await getFacebookPagesConnection(env, site.organization_id, site.id)
  if (!connection) return jsonResponse({ error: 'No Facebook connection found. Connect Facebook first.' }, { status: 404 })

  try {
    const pages = await getFacebookPages(connection.encrypted_user_token)
    return jsonResponse({
      pages: pages.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        fan_count: p.fan_count,
        picture: p.picture?.data?.url,
      })),
      connected_page_id: connection.facebook_page_id,
    })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Failed to fetch pages' }, { status: 502 })
  }
})
