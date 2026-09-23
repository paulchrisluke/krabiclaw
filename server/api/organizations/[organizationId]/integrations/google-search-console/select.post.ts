import { jsonResponse } from '~/server/utils/api-response'
import { sitePublicUrl } from '~/server/utils/domains'
import { googleAccessToken } from '~/server/utils/google-credential'
import {
  listSearchConsoleSites, storeSearchConsoleSelection, verifyAndAddProperty,
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

  const body = await readBody<{ site_url?: string }>(event).catch(() => null)
  const requested = body?.site_url?.trim()
  if (!requested) return jsonResponse({ error: 'Choose a Search Console property.' }, { status: 400 })

  const { env, db, organization} = await requireOrganizationAccess(event, organizationId)

  try {
    const accessToken = await googleAccessToken(env, organization.id)
    const owned = await listSearchConsoleSites(accessToken)
    if (owned.some(property => property.siteUrl === requested)) {
      await storeSearchConsoleSelection(env, organization.id, requested, null)
      return jsonResponse({ success: true, site_url: requested, verified: true })
    }

    // Only a URL KrabiClaw actually serves can be verified by serving a tag.
    const ownUrl = await sitePublicUrl(db, organization.id)
    if (!ownUrl || requested !== ownUrl) {
      return jsonResponse({
        error: 'KrabiClaw can only verify this website\'s own address. Add the property in Search Console first, then choose it here.',
      }, { status: 400 })
    }

    await verifyAndAddProperty(env, organization.id, ownUrl, async () => {
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
