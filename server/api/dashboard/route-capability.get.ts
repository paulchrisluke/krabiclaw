import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isDashboardRouteCapabilityAllowed } from '~/server/utils/dashboard-route-capability'

// Client-side counterpart to the server-branch check in middleware/dashboard.global.ts — SPA
// navigation never re-runs SSR, so the client needs this same allowed/not-allowed answer over
// the wire instead of re-deriving it from a payload it doesn't have.
export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ allowed: false }, { status: 503 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ allowed: false }, { status: 401 })

  const query = getQuery(event)
  const organizationSlug = typeof query.orgSlug === 'string' ? query.orgSlug : ''
  const siteSlug = typeof query.siteSlug === 'string' ? query.siteSlug : ''
  const locationSlug = typeof query.locationSlug === 'string' ? query.locationSlug : null
  const capabilityKey = typeof query.key === 'string' ? query.key : ''

  if (!organizationSlug || !siteSlug || !capabilityKey) {
    return jsonResponse({ error: 'orgSlug, siteSlug, and key are required' }, { status: 400 })
  }

  const allowed = await isDashboardRouteCapabilityAllowed(db, session.user.id, {
    organizationSlug,
    siteSlug,
    locationSlug,
    capabilityKey,
  })

  return jsonResponse({ allowed })
})
