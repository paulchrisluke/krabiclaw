import { defineHandler, HTTPError } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { requireLocationAccess } from '~/server/utils/location-access'
import { requestHeaders } from '~/server/utils/mcp-auth'
import { parseMerchantHandoffCapabilities } from '~/server/domain/merchant-handoff/contract'
import { activateMerchantHandoffDestination, merchantHandoffHttpError } from '~/server/utils/merchant-handoff'

interface DestinationBody {
  endpoint_url: string
  oauth_client_id: string
  provider: string
  provider_location_id: string
  capabilities: unknown
}

function parseBody(value: unknown): DestinationBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HTTPError({ statusCode: 400, statusMessage: 'Request body must be an object' })
  const body = value as Record<string, unknown>
  const allowed = ['endpoint_url', 'oauth_client_id', 'provider', 'provider_location_id', 'capabilities']
  const extras = Object.keys(body).filter(key => !allowed.includes(key)).sort()
  if (extras.length > 0) throw new HTTPError({ statusCode: 400, statusMessage: `Unknown request fields: ${extras.join(', ')}` })
  const bodyString = (field: 'endpoint_url' | 'oauth_client_id' | 'provider' | 'provider_location_id') => {
    const fieldValue = body[field]
    if (typeof fieldValue !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be a string` })
    return fieldValue
  }
  return {
    endpoint_url: bodyString('endpoint_url'),
    oauth_client_id: bodyString('oauth_client_id'),
    provider: bodyString('provider'),
    provider_location_id: bodyString('provider_location_id'),
    capabilities: body.capabilities,
  }
}

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  const { env, db, session, site } = await requireLocationAccess(event, siteId, locationId)
  try {
    const body = parseBody(await readBody<unknown>(event))
    type OAuthClientReader = { getOAuthClient(_input: { query: { client_id: string }; headers: HeadersInit }): Promise<{ scope?: string; disabled?: boolean }> }
    const oauthClientApi = createAuth(env).api as unknown as OAuthClientReader
    const oauthClient = await oauthClientApi.getOAuthClient({
      query: { client_id: body.oauth_client_id },
      headers: requestHeaders(event),
    })
    const scopes = typeof oauthClient.scope === 'string' ? oauthClient.scope.split(' ').filter(Boolean) : []
    if (oauthClient.disabled || !scopes.includes('merchant_handoff')) {
      return jsonResponse({ error: 'OAuth client must be active and allow the merchant_handoff scope' }, { status: 409 })
    }
    const destination = await activateMerchantHandoffDestination(db, {
      organizationId: site.organization_id,
      siteId,
      locationId,
      endpointUrl: body.endpoint_url,
      oauthClientId: body.oauth_client_id,
      provider: body.provider,
      providerLocationId: body.provider_location_id,
      capabilities: parseMerchantHandoffCapabilities(body.capabilities),
      createdBy: session.user.id,
    })
    return jsonResponse({ destination })
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    const mapped = merchantHandoffHttpError(error)
    return jsonResponse({ error: mapped.message }, { status: mapped.statusCode })
  }
})
