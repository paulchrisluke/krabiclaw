import { defineHandler, HTTPError  } from 'nitro';
import { cloudflareEnv } from '~/server/utils/api-response'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'

export default defineHandler((event) => {
  assertDevRouteAllowed(event)

  const env = cloudflareEnv(event)
  if (!env.DB) throw new HTTPError({ statusCode: 503, statusMessage: 'Database not available' })

  return { ok: true }
})
