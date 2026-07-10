import { getRequestURL } from 'h3'

export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event)
  const origin = requestUrl.origin

  return {
    client_id: requestUrl.toString(),
    client_name: 'KrabiClaw MCP auth regression client',
    redirect_uris: [`${origin}/oauth/test-callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'openid offline_access tenant platform_admin',
  }
})
