import { queryFirst } from '~/server/db'
import type { IntegrationVersion } from '~/shared/site-settings'
import { jsonResponse } from '../../../utils/api-response'
import { getFacebookAuthUrl } from '../../../utils/facebook-pages'
import { signOAuthState } from '../../../utils/encryption'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { requireRequestedOrganizationWideAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const body = await readBody(event) as { organizationId?: string } | undefined
  const { env, db, session, organization } = await requireRequestedOrganizationWideAccess(event, body?.organizationId)

  const allowed = await hasSiteEntitlement(env, db, organization.id, 'managed_service')
  if (!allowed) {
    return jsonResponse({ error: 'Facebook sync requires Growth.' }, { status: 403 })
  }

  if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY) {
    return jsonResponse({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const version = await queryFirst<IntegrationVersion>(db, `
      SELECT json_extract(integrations_json, '$.facebook.revision') AS revision
        FROM organization WHERE id = ?
    `, [organization.id])
  if (!version) throw new Error('Organization no longer exists')

  const state = await signOAuthState(env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string, {
    ...version, organizationId: organization.id, userId: session.user.id, timestamp: Date.now(), })

  const authUrl = getFacebookAuthUrl(env, state)
  return jsonResponse({ success: true, authUrl })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
