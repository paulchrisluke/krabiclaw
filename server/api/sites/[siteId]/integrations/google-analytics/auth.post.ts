import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getGoogleAnalyticsAuthUrl } from '~/server/utils/google-analytics'
import { signOAuthState } from '~/server/utils/encryption'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
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
    const site = await db.prepare(`
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member m ON o.id = m.organizationId
      WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const statePayload = {
      siteId: site.id,
      organizationId: site.organization_id,
      userId: session.user.id,
      timestamp: Date.now()
    }

    const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
    if (!hmacSecret) {
      return jsonResponse({ error: 'Server misconfiguration: encryption key not set' }, { status: 500 })
    }
    const state = await signOAuthState(hmacSecret, statePayload)

    const authUrl = getGoogleAnalyticsAuthUrl(env, state)

    return jsonResponse({ success: true, authUrl })
  } catch (error) {
    console.error('Failed to start Google Analytics OAuth:', error)
    const message = error instanceof Error ? error.message : 'Failed to start Google Analytics authorization'
    return jsonResponse({ error: message }, { status: 500 })
  }
})
