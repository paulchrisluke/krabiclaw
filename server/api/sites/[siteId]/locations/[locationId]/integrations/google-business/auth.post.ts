import { jsonResponse } from '~/server/utils/api-response'
import { getGoogleBusinessAuthUrl } from '~/server/utils/google-business'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { signOAuthState } from '~/server/utils/encryption'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and Location ID are required' }, { status: 400 })
  }

  const { env, db, session, site } = await requireLocationAccess(event, siteId, locationId)

  try {
    const entitled = await hasSiteEntitlement(db, site.id, 'google_business')
    if (!entitled) {
      return jsonResponse({
        error: 'Google Business integration requires a paid plan. Upgrade your plan to access this feature.'
      }, { status: 403 })
    }

    const statePayload = {
      siteId,
      organizationId: site.organization_id,
      userId: session.user.id,
      locationId,
      timestamp: Date.now()
    }

    const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
    if (!hmacSecret) {
      return jsonResponse({ error: 'Server misconfiguration: encryption key not set' }, { status: 500 })
    }
    const state = await signOAuthState(hmacSecret, statePayload)

    const authUrl = getGoogleBusinessAuthUrl(env, state)

    return jsonResponse({ success: true, authUrl })
  } catch (error) {
    console.error('Failed to start Google Business OAuth for location:', error)
    return jsonResponse({ error: 'Failed to start Google Business authorization' }, { status: 500 })
  }
})
