import { getRequestURL } from 'h3'
import { assertE2eFixtureEnabled } from '~/server/utils/dev-route-auth'

export default defineEventHandler((event) => {
  assertE2eFixtureEnabled()

  const requestUrl = getRequestURL(event)
  const origin = requestUrl.origin

  return {
    client_id: requestUrl.toString(),
    client_name: 'KrabiClaw MCP auth regression client',
    redirect_uris: [`${origin}/oauth/test-callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'openid offline_access tenant',
  }
})
