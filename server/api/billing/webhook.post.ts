import { toWebRequest } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'

/**
 * Compatibility alias for the Stripe Dashboard endpoint already configured in
 * production. Subscription verification and lifecycle handling live in the
 * Better Auth Stripe plugin at /api/auth/stripe/webhook.
 */
export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event) as CloudflareEnv
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const request = toWebRequest(event)
  const body = await request.arrayBuffer()
  const target = new URL(request.url)
  target.pathname = '/api/auth/stripe/webhook'
  target.search = ''

  const headers = new Headers(request.headers)
  headers.delete('content-length')
  headers.delete('cookie')
  const cloudflareContext = event.context.cloudflare?.context
  const waitUntil = cloudflareContext?.waitUntil?.bind(cloudflareContext)
  return await createAuth(env, { waitUntil }).handler(new Request(target, {
    method: 'POST',
    headers,
    body,
  }))
})
