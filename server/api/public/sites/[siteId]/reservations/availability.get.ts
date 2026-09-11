import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { listReservationSlots } from '~/server/utils/reservations'
import { addLocalDays } from '~/utils/timezone'
import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 14

/**
 * The reservation slots a guest can choose, for one location.
 *
 * Computed from that location's own hours and its date overrides. A location
 * that does not take reservations says so rather than returning an empty
 * calendar that looks like a fully booked one.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : null
  const locationId = typeof query.location_id === 'string' ? query.location_id : null
  if (!date || !DATE_PATTERN.test(date)) return jsonResponse({ error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 })
  if (!locationId) return jsonResponse({ error: 'location_id is required' }, { status: 400 })
  const days = Math.min(Math.max(Number(query.days) || 1, 1), MAX_DAYS)

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `SELECT id, organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })
  const location = await queryFirst<{ id: string }>(db, 'SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1', [locationId, siteId])
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  try {
    const dates: string[] = []
    for (let offset = 0; offset < days; offset += 1) dates.push(addLocalDays(date, offset))
    const calendar = await Promise.all(dates.map(async day => ({
      date: day,
      ...await listReservationSlots(db, { organizationId: site.organization_id, locationId: location.id, date: day }),
    })))
    return jsonResponse({ timezone: calendar[0]?.timezone ?? null, dates: calendar })
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_reservation_availability_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load availability' }, { status: 500 })
  }
})
