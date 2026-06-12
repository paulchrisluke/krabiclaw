import { cloudflareEnv } from '~/server/utils/api-response'
import { createError, defineEventHandler } from 'h3'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'

export default defineEventHandler((event) => {
  assertDevRouteAllowed(event)

  const env = cloudflareEnv(event)
  if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database not available' })

  return { ok: true }
})
