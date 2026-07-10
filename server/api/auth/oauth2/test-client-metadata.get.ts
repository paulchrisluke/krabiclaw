import { getHeader, getRequestURL } from 'h3'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

export default defineEventHandler((event) => {
  const host = getHeader(event, 'host') || ''
  if (!import.meta.dev && !isPreviewContext(host)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden in production'
    })
  }

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
