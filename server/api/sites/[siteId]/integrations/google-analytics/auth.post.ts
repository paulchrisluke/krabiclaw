import { jsonResponse } from '~/server/utils/api-response'
import { getGoogleAnalyticsAuthUrl } from '~/server/utils/google-analytics'
import { signOAuthState } from '~/server/utils/encryption'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const { env, session, site } = await requireSiteAccess(event, siteId)

  try {
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
