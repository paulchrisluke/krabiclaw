import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getFacebookAuthUrl } from '../../../utils/facebook-pages'
import { signOAuthState } from '../../../utils/encryption'
import { getDashboardRestaurant } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event).catch(() => ({})) as { siteId?: string }
  const site = body?.siteId
    ? await db.prepare(`
        SELECT s.id, s.organization_id FROM sites s
        JOIN member om ON s.organization_id = om.organizationId
        WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
        LIMIT 1
      `).bind(body.siteId, session.user.id).first<{ id: string; organization_id: string }>()
    : (await getDashboardRestaurant(event)).restaurant

  if (!site) return jsonResponse({ error: 'Restaurant not found or access denied' }, { status: 404 })

  if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY) {
    return jsonResponse({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const state = await signOAuthState(env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string, {
    siteId: site.id,
    organizationId: site.organization_id,
    userId: session.user.id,
    timestamp: Date.now(),
  })

  const authUrl = getFacebookAuthUrl(env, state)
  return jsonResponse({ success: true, authUrl })
})
