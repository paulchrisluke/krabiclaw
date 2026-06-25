// GET /api/dashboard/locations/[id] — Fetch a single location for the workspace page
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { parseLocationPayload } from './location-helpers'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const locationId = getRouterParam(event, 'id')
  if (!locationId) return jsonResponse({ error: 'Location ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  // Don't require the x-dashboard-site-slug header here: a location is fully
  // self-scoping once we know the org (the id is already in the URL), and some
  // callers — like the post-transfer onboarding wizard at the org-scoped
  // /~/onboarding route — have no siteSlug route param to attach it from, and
  // may legitimately belong to an org with multiple sites at the time of the call.
  const dashboard = await getDashboardContext(event, { requireSite: false })
  const { organization } = dashboard
  if (!organization) {
    return jsonResponse({ error: 'Organization not found' }, { status: 400 })
  }
  const organizationId = organization.id as string

  const location = await queryFirst(db, `
    SELECT * FROM business_locations
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `, [locationId, organizationId])

  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  return jsonResponse({ success: true, location: parseLocationPayload(location) })
})
