import { queryFirst } from '~/server/db'
import type { IntegrationVersion } from '~/shared/site-settings'
import { jsonResponse } from '~/server/utils/api-response'
import { getGoogleAnalyticsAuthUrl } from '~/server/utils/google-analytics'
import { signOAuthState } from '~/server/utils/encryption'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) {
    return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  }

  const { env, db, session, organization } = await requireOrganizationAccess(event, organizationId)

  try {
    const version = await queryFirst<IntegrationVersion>(db, `
      SELECT json_extract(integrations_json, '$.google_credential.revision') AS revision
        FROM organization WHERE id = ?
    `, [organization.id])
    if (!version) throw new Error('Organization no longer exists')

    const statePayload = {
      ...version, organizationId: organization.id, userId: session.user.id, timestamp: Date.now()
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
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
