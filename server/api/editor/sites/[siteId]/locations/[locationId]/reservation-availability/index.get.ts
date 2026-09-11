import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { listReservationSlots } from '~/server/utils/reservations'
import { requireLocationAccess } from '~/server/utils/location-access'
import { addLocalDays } from '~/utils/timezone'

const MAX_DAYS = 42

/**
 * One location's reservation calendar.
 *
 * Slots are computed from the location's own hours and its date overrides.
 * There is no product side to this endpoint: a product's sessions are real
 * rows with their own screen, and folding the two into one calendar is what
 * made a session look like a slot that could be "reopened".
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)
    const query = getQuery(event)
    const from = typeof query.from === 'string' ? query.from : null
    const to = typeof query.to === 'string' ? query.to : null
    if (!from || !to) return jsonResponse({ error: 'from and to are required' }, { status: 400 })

    const days: string[] = []
    for (let date = from; date <= to; date = addLocalDays(date, 1)) {
      days.push(date)
      if (days.length > MAX_DAYS) return jsonResponse({ error: `Ranges may not exceed ${MAX_DAYS} days` }, { status: 400 })
    }
    const calendar = await Promise.all(days.map(async date => ({
      date,
      ...await listReservationSlots(db, { organizationId: site.organization_id, locationId, date, includePast: true }),
    })))
    return jsonResponse({ success: true, from, to, days: calendar })
  } catch (error) {
    rethrowHttpError(error)
    console.error('reservation_availability_read_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to read the reservation calendar' }, { status: 500 })
  }
})
