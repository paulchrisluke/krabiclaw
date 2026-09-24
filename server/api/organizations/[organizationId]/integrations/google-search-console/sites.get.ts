import { jsonResponse } from '~/server/utils/api-response'
import { credentialGrants, googleAccessToken, readGoogleCredential } from '~/server/utils/google-credential'
import { listSearchConsoleSites, readSearchConsoleIntegration } from '~/server/utils/google-search-console'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { sitePublicUrl } from '~/server/utils/domains'

/**
 * What the Search Console leaf shows: the connected account, the property
 * chosen, the properties the account already owns, and this site's own public
 * URL — the one KrabiClaw can verify automatically, which is offered even when
 * the account does not own it yet.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const { env, db, organization} = await requireOrganizationAccess(event, organizationId)
  const credential = await readGoogleCredential(env, organization.id)
  const searchConsole = await readSearchConsoleIntegration(env, organization.id)
  const siteUrl = await sitePublicUrl(db, organization.id)

  if (!credential || !credentialGrants(credential, 'search-console')) {
    return jsonResponse({
      success: true,
      account: credential?.provider_account_email ?? null,
      authorized: false,
      searchConsole,
      siteUrl,
      properties: [],
      error: null,
    })
  }

  try {
    const properties = await listSearchConsoleSites(await googleAccessToken(env, organization.id))
    return jsonResponse({
      success: true,
      account: credential.provider_account_email,
      authorized: true,
      searchConsole,
      siteUrl,
      properties,
      error: null,
    })
  } catch (error) {
    console.error('google_search_console_sites_failed', { organizationId: organization.id, error })
    return jsonResponse({
      success: true,
      account: credential.provider_account_email,
      authorized: true,
      searchConsole,
      siteUrl,
      properties: [],
      error: 'Could not load Search Console properties. Make sure the Search Console API is enabled.',
    })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
