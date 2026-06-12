// Dev-login readiness probe for Playwright webServer checks.
// Mirrors the same availability gate as login.get.ts, but avoids creating a
// session or redirecting. This lets HEAD/health probes verify the route exists
// before E2E tests start.
import { cloudflareEnv } from '~/server/utils/api-response'
import { createError, defineEventHandler } from 'h3'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'

export default defineEventHandler(async (event) => {
  assertDevRouteAllowed(event)

  const env = cloudflareEnv(event)
  if (!env.DB) throw createError({ statusCode: 500, statusMessage: 'No database' })

  return new Response(null, { status: 200 })
})
