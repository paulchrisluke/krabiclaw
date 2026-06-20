// GET /api/dashboard/locations/[id] — Fetch a single location for the workspace page
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { parseLocationPayload } from './location-helpers'

export default defineEventHandler(async (event) => {
  const locationId = getRouterParam(event, 'id')
  if (!locationId) return jsonResponse({ error: 'Location ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const dashboard = await getDashboardContext(event, { requireRestaurant: true })
  if (!dashboard?.restaurant) {
    return jsonResponse({ error: 'No site found' }, { status: 400 })
  }

  const { organization, restaurant } = dashboard
  if (!organization) {
    return jsonResponse({ error: 'Organization not found' }, { status: 400 })
  }
  const organizationId = organization.id as string
  const siteId = restaurant.id as string

  const location = await db.prepare(`
    SELECT * FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `).bind(locationId, organizationId, siteId).first()

  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  return jsonResponse({ success: true, location: parseLocationPayload(location) })
})
