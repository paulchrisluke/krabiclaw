import { getHeader, getRequestURL } from 'h3'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

export default defineEventHandler((event) => {
  const host = getHeader(event, 'host') || ''
  if (!import.meta.dev && !isPreviewContext(host)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden in production' })
  }

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
