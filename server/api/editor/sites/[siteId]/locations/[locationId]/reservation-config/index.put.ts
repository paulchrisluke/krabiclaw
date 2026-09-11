import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { renderBookingPolicySummary, reservationPolicySummarySource, upsertLocationReservationConfig, validateLocationReservationConfigPatch } from '~/server/utils/reservations'
import { getSourceLocale } from '~/server/utils/site-locales'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/** Creating this row is what enables reservations at the location. */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const patch = await validateLocationReservationConfigPatch(await readRequiredBody<Record<string, unknown>>(event))
    const config = await upsertLocationReservationConfig(db, {
      organizationId: site.organization_id, locationId, patch, actorId: session.user.id,
    })
    const locale = await getSourceLocale(db, site.organization_id, siteId)
    return jsonResponse({ success: true, config, summary: renderBookingPolicySummary(reservationPolicySummarySource(config), locale) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('reservation_config_write_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to save the reservation policy' }, { status: 500 })
  }
})
