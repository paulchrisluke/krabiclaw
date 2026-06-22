import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler((event) => {
  const env = cloudflareEnv(event)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')

  setResponseHeaders(event, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  })

  return {
    resource: `${baseUrl}/api/mcp/platform`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'offline_access', 'platform_admin'],
  }
})
