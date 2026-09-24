import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { signOAuthState } from '~/server/utils/encryption'
import { getFacebookAuthUrl } from '~/server/utils/facebook-pages'
import { requireOrganizationAccess } from '~/server/utils/location-access'

// Starts Facebook Login for Business. The callback stores the Page when there
// is one, and otherwise holds the choices for the Facebook leaf to ask about.
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const { env, db, session, organization } = await requireOrganizationAccess(event, organizationId)
  if (!await hasSiteEntitlement(env, db, organization.id, 'managed_service')) {
    return jsonResponse({ error: 'Facebook requires the Growth plan.' }, { status: 403 })
  }

  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return jsonResponse({ error: 'Server misconfiguration: encryption key not set' }, { status: 500 })

  const current = await queryFirst<{ revision: string | null }>(db, `
    SELECT json_extract(integrations_json, '$.facebook.revision') AS revision
      FROM organization WHERE id = ?
  `, [organization.id])
  if (!current) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  const state = await signOAuthState(hmacSecret, {
    revision: current.revision, organizationId: organization.id, userId: session.user.id, timestamp: Date.now(),
  })
  return jsonResponse({ success: true, authUrl: getFacebookAuthUrl(env, state) })
})
