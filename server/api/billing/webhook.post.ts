import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'

/**
 * Compatibility alias for the Stripe Dashboard endpoint already configured in
 * production. Subscription verification and lifecycle handling live in the
 * Better Auth Stripe plugin at /api/auth/stripe/webhook.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event) as CloudflareEnv
  if (!env.DB) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const request = event.req
  const body = await request.arrayBuffer()
  const target = new URL(request.url)
  target.pathname = '/api/auth/stripe/webhook'
  target.search = ''

  const headers = new Headers(request.headers)
  headers.delete('content-length')
  headers.delete('cookie')
  return await createAuth(env).handler(new Request(target, {
    method: 'POST',
    headers,
    body,
  }))
})
