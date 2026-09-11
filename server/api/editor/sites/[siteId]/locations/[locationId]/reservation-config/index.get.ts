import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { getLocationReservationConfig, renderBookingPolicySummary, reservationPolicySummarySource } from '~/server/utils/reservations'
import { getSourceLocale } from '~/server/utils/site-locales'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)
    const config = await getLocationReservationConfig(db, { organizationId: site.organization_id, locationId })
    // A null config means this location does not take reservations. That is
    // the answer, not an empty policy to be filled with defaults.
    if (!config) return jsonResponse({ success: true, config: null, summary: null })
    const locale = await getSourceLocale(db, site.organization_id, siteId)
    return jsonResponse({ success: true, config, summary: renderBookingPolicySummary(reservationPolicySummarySource(config), locale) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('reservation_config_read_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to read the reservation policy' }, { status: 500 })
  }
})
