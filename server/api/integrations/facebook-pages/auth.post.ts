import { jsonResponse } from '../../../utils/api-response'
import { getFacebookAuthUrl } from '../../../utils/facebook-pages'
import { signOAuthState } from '../../../utils/encryption'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { requireRequestedSiteWideAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as { siteId?: string }
  const { env, db, session, site } = await requireRequestedSiteWideAccess(event, body.siteId)

  const allowed = await hasSiteEntitlement(db, site.id, 'managed_service')
  if (!allowed) {
    return jsonResponse({ error: 'Facebook sync is included in the Managed plan and above.' }, { status: 403 })
  }

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
