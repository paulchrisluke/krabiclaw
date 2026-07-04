import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getExperienceById, getSlotAvailability, resolveExperienceTimezone } from '~/server/utils/experiences'
import { queryFirst } from '~/server/db'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 31

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : null
  if (!date || !DATE_PATTERN.test(date)) {
    return jsonResponse({ error: 'A valid date (YYYY-MM-DD) is required' }, { status: 400 })
  }
  const days = Math.min(Math.max(Number(query.days) || 1, 1), MAX_DAYS)

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string }>(
    db,
    `SELECT s.id, s.organization_id FROM sites s
       JOIN member m ON m.organizationId = s.organization_id
       WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin') LIMIT 1`,
    [siteId, session.user.id],
  )
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const experience = await getExperienceById(db, siteId, experienceId)
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  const timezone = await resolveExperienceTimezone(db, site.organization_id, siteId, experience)

  const dates: Array<{ date: string; slots: Awaited<ReturnType<typeof getSlotAvailability>> }> = []
  const cursor = new Date(`${date}T00:00:00Z`)
  for (let i = 0; i < days; i++) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const slots = await getSlotAvailability(db, siteId, experience, dateStr, timezone)
    dates.push({ date: dateStr, slots })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return jsonResponse({ timezone, dates })
})
