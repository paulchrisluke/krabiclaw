import { getRequestURL } from 'h3'
import { assertE2eFixtureEnabled } from '~/server/utils/dev-route-auth'

export default defineEventHandler((event) => {
  assertE2eFixtureEnabled(event)

  const requestUrl = getRequestURL(event)
  const origin = requestUrl.origin

  return {
    client_id: requestUrl.toString(),
    client_name: 'KrabiClaw ChatGPT-shaped CIMD regression client',
    redirect_uris: [`${origin}/oauth/test-callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    // ChatGPT advertises capabilities in this plural field and omits both the
    // singular preference and scope. Our CIMD normalization must select the
    // authenticated method and valid tenant defaults.
    token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
    jwks_uri: `${origin}/api/auth/oauth2/test-private-client-jwks`,
  }
})
import { defineEventHandler } from 'h3'
