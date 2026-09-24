import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { hasOrganizationEntitlement } from '~/server/utils/billing'
import { signOAuthState } from '~/server/utils/encryption'
import { getInstagramAuthUrl } from '~/server/utils/instagram'
import { requireOrganizationAccess } from '~/server/utils/location-access'

// Starts Instagram Login for a professional account. Instagram is its own
// connection: nothing here reads the Facebook Page.
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const { env, db, session, organization } = await requireOrganizationAccess(event, organizationId)
  if (!await hasOrganizationEntitlement(env, organization.id, 'managed_service')) {
    return jsonResponse({ error: 'Instagram requires the Growth plan.' }, { status: 403 })
  }

  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return jsonResponse({ error: 'Server misconfiguration: encryption key not set' }, { status: 500 })

  const current = await queryFirst<{ revision: string | null }>(db, `
    SELECT json_extract(integrations_json, '$.instagram.revision') AS revision
      FROM organization WHERE id = ?
  `, [organization.id])
  if (!current) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  const state = await signOAuthState(hmacSecret, {
    revision: current.revision, organizationId: organization.id, userId: session.user.id, timestamp: Date.now(),
  })
  return jsonResponse({ success: true, authUrl: getInstagramAuthUrl(env, state) })
})
