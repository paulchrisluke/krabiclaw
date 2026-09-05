import { defineHandler } from 'nitro'
import { getRequestHost, getRequestProtocol } from 'nitro/h3'

// Public client metadata only. Consent, PKCE, identity and tenant permissions
// remain enforced by the existing Better Auth OAuth provider and MCP endpoint.
export default defineHandler((event) => {
  const clientId = new URL('/oauth-clients/client-localization.json', event.url)
  clientId.host = getRequestHost(event)
  clientId.protocol = `${getRequestProtocol(event)}:`
  return {
    client_id: clientId.toString(),
    client_name: 'Kikuzuki translation publisher',
    redirect_uris: ['http://127.0.0.1:9471/callback'],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'native',
    scope: 'openid tenant',
  }
})
