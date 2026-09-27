import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import { jsonResponse } from '~/server/utils/api-response'
import { linkedAccountAccessToken, requireIntegrationAccount } from '~/server/utils/auth'
import { organizationPublicUrl } from '~/server/utils/domains'
import {
  listSearchConsoleSites, readSearchConsoleIntegration, storeSearchConsoleSelection, verifyAndAddProperty,
} from '~/server/utils/google-search-console'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { purgePublicResourceCacheNow } from '~/server/utils/public-resource-cache'

/**
 * Connecting a Search Console property.
 *
 * A property the account already owns is simply selected — Google has already
 * been satisfied about it, and asking it to verify again would be theatre.
 * This site's own URL takes the automated route instead: KrabiClaw asks Google
 * for the META token, serves it, and has Google come and look. The tenant
 * never sees a token, which is the whole point of deleting the field that used
 * to make them paste one.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const body = await readBody<{ account_id?: string; site_url?: string }>(event).catch(() => null)
  const accountId = body?.account_id?.trim()
  const requested = body?.site_url?.trim()
  if (!accountId || !requested) return jsonResponse({ error: 'Choose a Google account and a Search Console property.' }, { status: 400 })

  const { env, db, session, organization } = await requireOrganizationAccess(event, organizationId)
  const current = await readSearchConsoleIntegration(env, organization.id)
  await requireIntegrationAccount(env, accountId, {
    userId: session.user.id,
    currentAccountId: current?.account_id,
    providerId: 'google',
    scopes: INTEGRATION_SCOPES['google-search-console'],
  })

  try {
    const { accessToken } = await linkedAccountAccessToken(env, accountId)
    const owned = await listSearchConsoleSites(accessToken)
    if (owned.some(property => property.siteUrl === requested)) {
      await storeSearchConsoleSelection(env, organization.id, accountId, requested, null)
      return jsonResponse({ success: true, site_url: requested, verified: true })
    }

    // Only a URL KrabiClaw actually serves can be verified by serving a tag.
    const ownUrl = await organizationPublicUrl(db, organization.id)
    if (!ownUrl || requested !== ownUrl) {
      return jsonResponse({
        error: 'KrabiClaw can only verify this website\'s own address. Add the property in Search Console first, then choose it here.',
      }, { status: 400 })
    }

    await verifyAndAddProperty(env, organization.id, accountId, ownUrl, async () => {
      // The tag has to be on the live page before Google fetches it, and the
      // public HTML is cached.
      await purgePublicResourceCacheNow(env, organization.id)
    })

    return jsonResponse({ success: true, site_url: ownUrl, verified: true })
  } catch (error) {
    console.error('google_search_console_select_failed', { organizationId: organization.id, error })
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Could not connect that Search Console property.',
    }, { status: 502 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody } from 'nitro/h3';
