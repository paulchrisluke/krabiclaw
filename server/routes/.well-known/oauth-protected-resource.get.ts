import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler((event) => {
  const env = cloudflareEnv(event)
  const baseUrl = env.BETTER_AUTH_URL ?? 'https://krabiclaw.com'

  setResponseHeaders(event, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  })

  return {
    resource: `${baseUrl}/api/mcp`,
    // Must match the `issuer` field in /.well-known/oauth-authorization-server
    // (Better Auth sets issuer = baseURL + basePath = baseUrl + "/api/auth")
    authorization_servers: [`${baseUrl}/api/auth`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'offline_access', 'tenant'],
  }
})
