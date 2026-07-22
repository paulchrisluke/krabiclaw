import { jsonResponse } from '~/server/utils/api-response'
import { DASHBOARD_MANAGEMENT_WINDOW_DAYS, getExperienceById, getSlotAvailability, resolveExperienceTimezone } from '~/server/utils/experiences'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess } from '~/server/utils/member-access'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = DASHBOARD_MANAGEMENT_WINDOW_DAYS

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

  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  const experience = await getExperienceById(db, siteId, experienceId)
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: experience.location_id,
  })

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
