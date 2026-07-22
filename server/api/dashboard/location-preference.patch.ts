import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { execute, queryFirst } from '~/server/db'
import { assertLocationAccess } from '~/server/utils/member-access'

interface LocationPreferenceBody {
  locationId: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LocationPreferenceBody>(event)
  const locationId = typeof body?.locationId === 'string' ? body.locationId : ''

  if (!locationId) {
    return jsonResponse({ error: 'Location ID is required' }, { status: 400 })
  }

  const { db, userId, organization, site } = await getDashboardContext(event, { requireSite: false })
  if (!site) {
    return jsonResponse({ error: 'Site workspace has not been created yet' }, { status: 400 })
  }

  const location = await queryFirst<{ id: string }>(db, `
    SELECT id
    FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active'
    LIMIT 1
  `, [locationId, organization.id, site.id])

  if (!location) {
    return jsonResponse({ error: 'Location not found' }, { status: 404 })
  }
  await assertLocationAccess(db, {
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
    siteId: site.id,
    locationId,
  })

  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO dashboard_preferences (
      id, user_id, organization_id, selected_location_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, organization_id) DO UPDATE SET
      selected_location_id = excluded.selected_location_id,
      updated_at = excluded.updated_at
  `, [
    `dashboard-pref-${userId}-${organization.id}`,
    userId,
    organization.id,
    locationId,
    now,
    now
  ])

  return jsonResponse({ success: true, selectedLocationId: locationId })
})
