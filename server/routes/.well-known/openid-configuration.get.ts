import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')

  // Forward to the Better Auth oauth-provider endpoint which serves the real document.
  const upstream = await fetch(`${baseUrl}/api/auth/.well-known/openid-configuration`)
  const body = await upstream.text()

  setResponseHeaders(event, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=3600',
  })
  setResponseStatus(event, upstream.status)
  return body
})
