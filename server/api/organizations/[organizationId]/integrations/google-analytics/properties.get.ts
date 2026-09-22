import { jsonResponse } from '~/server/utils/api-response'
import { listGa4Properties, readAnalyticsIntegration } from '~/server/utils/google-analytics'
import { credentialGrants, googleAccessToken, readGoogleCredential } from '~/server/utils/google-credential'
import { requireOrganizationAccess } from '~/server/utils/location-access'

/**
 * What the Analytics leaf shows: the connected account, the property chosen,
 * and the properties available to choose from.
 *
 * Search Console is not mentioned here. The two products share a credential,
 * not a screen, and listing one's resources beside the other is what made them
 * look like a single "Google" integration.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const { env, organization } = await requireOrganizationAccess(event, organizationId)
  const credential = await readGoogleCredential(env, organization.id)
  const analytics = await readAnalyticsIntegration(env, organization.id)

  // A credential connected for Search Console alone cannot read GA4, so the
  // leaf offers a connect rather than an empty property list that looks like
  // the account having no properties.
  if (!credential || !credentialGrants(credential, 'analytics')) {
    return jsonResponse({
      success: true,
      account: credential?.provider_account_email ?? null,
      authorized: false,
      analytics,
      properties: [],
      error: null,
    })
  }

  try {
    const properties = await listGa4Properties(await googleAccessToken(env, organization.id))
    return jsonResponse({
      success: true, account: credential.provider_account_email, authorized: true,
      analytics, properties, error: null,
    })
  } catch (error) {
    console.error('google_analytics_properties_failed', { organizationId: organization.id, error })
    return jsonResponse({
      success: true, account: credential.provider_account_email, authorized: true,
      analytics, properties: [],
      error: 'Could not load Analytics properties. Make sure the Google Analytics Admin API is enabled.',
    })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
