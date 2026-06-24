import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getGoogleBusinessAuthUrl } from '~/server/utils/google-business'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { signOAuthState } from '~/server/utils/encryption'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and Location ID are required' }, { status: 400 })
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
    const site = await queryFirst<{ id: string; organization_id: string }>(db, `
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
      LIMIT 1
    `, [siteId, session.user.id])

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const location = await queryFirst<{ id: string }>(db, `
      SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1
    `, [locationId, siteId])

    if (!location) {
      return jsonResponse({ error: 'Location not found' }, { status: 404 })
    }

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
