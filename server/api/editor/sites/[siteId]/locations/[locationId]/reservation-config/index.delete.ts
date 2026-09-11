import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { deleteLocationReservationConfig } from '~/server/utils/reservations'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)
    // Stops the location taking reservations, and removes its date overrides.
    // Existing reservations keep their own records.
    await deleteLocationReservationConfig(db, { organizationId: site.organization_id, locationId })
    return jsonResponse({ success: true, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('reservation_config_delete_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to remove the reservation policy' }, { status: 500 })
  }
})
