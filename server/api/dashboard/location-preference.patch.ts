import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardRestaurant } from '~/server/utils/dashboard-context'

interface LocationPreferenceBody {
  locationId: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LocationPreferenceBody>(event)
  const locationId = typeof body?.locationId === 'string' ? body.locationId : ''

  if (!locationId) {
    return jsonResponse({ error: 'Location ID is required' }, { status: 400 })
  }

  const { db, userId, organization, restaurant } = await getDashboardRestaurant(event)

  const location = await db.prepare(`
    SELECT id
    FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active'
    LIMIT 1
  `).bind(locationId, organization.id, restaurant.id).first<{ id: string }>()

  if (!location) {
    return jsonResponse({ error: 'Location not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO dashboard_preferences (
      id, user_id, organization_id, selected_location_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, organization_id) DO UPDATE SET
      selected_location_id = excluded.selected_location_id,
      updated_at = excluded.updated_at
  `).bind(
    `dashboard-pref-${userId}-${organization.id}`,
    userId,
    organization.id,
    locationId,
    now,
    now
  ).run()

  return jsonResponse({ success: true, selectedLocationId: locationId })
})
