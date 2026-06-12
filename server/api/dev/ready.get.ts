import { defineEventHandler } from 'h3'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'

// E2E readiness probe. Mirrors the same availability gate as other dev routes
// but has no side effects, redirects, or auth/session coupling.
export default defineEventHandler((event) => {
  assertDevRouteAllowed(event)
  return { ok: true }
})
