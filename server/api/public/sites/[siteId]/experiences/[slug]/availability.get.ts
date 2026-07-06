import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { PUBLIC_BOOKING_WINDOW_DAYS, getExperienceBySlug, getSlotAvailability, resolveExperienceTimezone } from '~/server/utils/experiences'
import { queryFirst } from '~/server/db'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = PUBLIC_BOOKING_WINDOW_DAYS

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'siteId and slug required' }, { status: 400 })

  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : null
  if (!date || !DATE_PATTERN.test(date)) {
    return jsonResponse({ error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 })
  }
  const days = Math.min(Math.max(Number(query.days) || 1, 1), MAX_DAYS)

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `SELECT id, organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])
  if (!site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  const experience = await getExperienceBySlug(db, siteId, slug)
  if (!experience || experience.status === 'inactive') {
    return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  }
  // sold_out is a global "not bookable right now" flag set by the owner — the
  // experience is still public, but every date has zero real availability.
  if (experience.status === 'sold_out') {
    return jsonResponse({ timezone: null, dates: [] })
  }

  const timezone = await resolveExperienceTimezone(db, site.organization_id, siteId, experience)

  const dates: Array<{ date: string; slots: Awaited<ReturnType<typeof getSlotAvailability>> }> = []
  const cursor = new Date(`${date}T00:00:00Z`)
  if (isNaN(cursor.getTime())) {
    return jsonResponse({ error: 'Invalid calendar date' }, { status: 400 })
  }
  for (let i = 0; i < days; i++) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const slots = await getSlotAvailability(db, siteId, experience, dateStr, timezone)
    dates.push({ date: dateStr, slots })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return jsonResponse({ timezone, dates })
})
