import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getReservationSlotAvailability } from '~/server/utils/reservations'
import { resolveLocationTimezone } from '~/server/utils/site-config'
import { queryFirst } from '~/server/db'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 14

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : null
  const locationId = typeof query.location_id === 'string' ? query.location_id : null
  if (!date || !DATE_PATTERN.test(date)) {
    return jsonResponse({ error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 })
  }
  if (!locationId) {
    return jsonResponse({ error: 'location_id is required' }, { status: 400 })
  }
  const days = Math.min(Math.max(Number(query.days) || 1, 1), MAX_DAYS)

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `SELECT id, organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const location = await queryFirst<{ id: string; max_capacity: number | null; opening_hours: string | null }>(
    db,
    `SELECT id, max_capacity, opening_hours FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`,
    [locationId, siteId],
  )
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  let parsedHours: unknown = null
  try {
    parsedHours = location.opening_hours ? JSON.parse(location.opening_hours) : null
  } catch {
    return jsonResponse({ error: 'Location hours configuration is invalid. Please contact support.' }, { status: 500 })
  }

  const timezone = await resolveLocationTimezone(db, site.organization_id, siteId, locationId)

  const dates: Array<{ date: string; slots: Awaited<ReturnType<typeof getReservationSlotAvailability>> }> = []
  const cursor = new Date(`${date}T00:00:00Z`)
  if (isNaN(cursor.getTime())) {
    return jsonResponse({ error: 'Invalid calendar date' }, { status: 400 })
  }
  for (let i = 0; i < days; i++) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const slots = await getReservationSlotAvailability(db, siteId, { id: location.id, max_capacity: location.max_capacity, opening_hours: parsedHours }, dateStr)
    dates.push({ date: dateStr, slots })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return jsonResponse({ timezone, dates })
})
