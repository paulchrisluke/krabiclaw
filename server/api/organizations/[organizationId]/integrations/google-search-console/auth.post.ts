import { queryFirst } from '~/server/db'
import { jsonResponse } from '~/server/utils/api-response'
import { googleAuthUrl } from '~/server/utils/google-credential'
import { signOAuthState } from '~/server/utils/encryption'
import { requireOrganizationAccess } from '~/server/utils/location-access'

// Starts this product's authorization. The product travels in the signed
// state so one callback and one registered redirect URI serve both, and the
// scopes asked for are only this product's.
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const { env, db, session, organization} = await requireOrganizationAccess(event, organizationId)

  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return jsonResponse({ error: 'Server misconfiguration: encryption key not set' }, { status: 500 })

  const current = await queryFirst<{ revision: string | null }>(db, `
    SELECT json_extract(integrations_json, '$.google_credential.revision') AS revision
      FROM organization WHERE id = ?
  `, [organization.id])
  if (!current) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  const state = await signOAuthState(hmacSecret, {
    revision: current.revision,
    product: 'search-console',
    organizationId: organization.id,
    userId: session.user.id,
    timestamp: Date.now(),
  })

  return jsonResponse({ success: true, authUrl: googleAuthUrl(env, 'search-console', state) })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
