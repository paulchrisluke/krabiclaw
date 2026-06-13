import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const auth = createAuth(env)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')

  // Call the oauthProvider-registered endpoint directly — no HTTP subrequest.
  // HTTP self-calls (fetch(${baseUrl}/api/auth/...)) time out in Cloudflare Workers.
  const api = auth.api as Record<string, (opts: { request: Request; asResponse: false }) => Promise<unknown>>
  const metadata = await api.getOpenIdConfig({
    request: new Request(`${baseUrl}/.well-known/openid-configuration`),
    asResponse: false,
  })

  setResponseHeaders(event, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=3600',
  })
  return metadata
})
