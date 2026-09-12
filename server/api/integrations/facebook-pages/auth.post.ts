import { queryFirst } from '~/server/db'
import type { IntegrationVersion } from '~/shared/site-settings'
import { jsonResponse } from '../../../utils/api-response'
import { getFacebookAuthUrl } from '../../../utils/facebook-pages'
import { signOAuthState } from '../../../utils/encryption'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { requireRequestedSiteWideAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const body = await readBody(event) as { siteId?: string } | undefined
  const { env, db, session, site } = await requireRequestedSiteWideAccess(event, body?.siteId)

  const allowed = await hasSiteEntitlement(db, site.id, 'managed_service')
  if (!allowed) {
    return jsonResponse({ error: 'Facebook sync requires Growth.' }, { status: 403 })
  }

  if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY) {
    return jsonResponse({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const version = await queryFirst<IntegrationVersion>(db, `
      SELECT json_extract(integrations_json, '$.facebook.revision') AS revision
        FROM sites WHERE id = ? AND organization_id = ?
    `, [site.id, site.organization_id])
  if (!version) throw new Error('Site no longer belongs to this organization')

  const state = await signOAuthState(env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string, {
    ...version, siteId: site.id, organizationId: site.organization_id, userId: session.user.id, timestamp: Date.now(), })

  const authUrl = getFacebookAuthUrl(env, state)
  return jsonResponse({ success: true, authUrl })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
