import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')

  // Better Auth registers getOAuthServerConfig at /.well-known/oauth-authorization-server
  // under the auth basePath. Requesting via /api/auth/ lets Better Auth's endpoint router
  // strip the basePath and serve the RFC 8414 metadata document.
  const upstream = await fetch(`${baseUrl}/api/auth/.well-known/oauth-authorization-server`)
  const body = await upstream.text()

  setResponseHeaders(event, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=3600',
  })
  setResponseStatus(event, upstream.status)
  return body
})
