// PATCH /api/dashboard/locations/[id] — Update a location
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'

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
  const organizationId = organization?.id as string
  const siteId = restaurant.id as string

  // Verify the location belongs to this organization and site
  const location = await db.prepare(`
    SELECT id FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `).bind(locationId, organizationId, siteId).first<{ id: string }>()

  if (!location) {
    return jsonResponse({ error: 'Location not found or access denied' }, { status: 404 })
  }

  const body = await readBody(event)
  const updates: string[] = []
  const params: (string | number | null)[] = []

  if (body.grab_url !== undefined) {
    updates.push('grab_url = ?')
    params.push(body.grab_url)
  }
  if (body.uber_eats_url !== undefined) {
    updates.push('uber_eats_url = ?')
    params.push(body.uber_eats_url)
  }
  if (body.foodpanda_url !== undefined) {
    updates.push('foodpanda_url = ?')
    params.push(body.foodpanda_url)
  }

  if (updates.length === 0) {
    return jsonResponse({ error: 'No valid fields to update' }, { status: 400 })
  }

  params.push(new Date().toISOString())
  updates.push('updated_at = ?')
  params.push(locationId)

  await db.prepare(`
    UPDATE business_locations
    SET ${updates.join(', ')}
    WHERE id = ?
  `).bind(...params).run()

  return jsonResponse({ success: true })
})
