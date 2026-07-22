import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listExperienceBookings } from '~/server/utils/experiences'
import { assertResourceAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string; member_id: string; member_role: string }>(
    db,
    `SELECT s.id, s.organization_id, m.id AS member_id, m.role AS member_role FROM sites s
       JOIN member m ON m.organizationId = s.organization_id
       WHERE s.id = ? AND m.userId = ? LIMIT 1`,
    [siteId, session.user.id],
  )

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const experience = await queryFirst<{ location_id: string }>(db, `SELECT location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1`, [experienceId, siteId])
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: experience.location_id,
  })

  const query = getQuery(event)
  const locationId = typeof query.location_id === 'string' && query.location_id.trim()
    ? query.location_id.trim()
    : null

  if (locationId) {
    const location = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`,
      [locationId, siteId],
    )
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
  }

  const bookings = await listExperienceBookings(db, siteId, experienceId, { locationId })
  return jsonResponse({ bookings })
})
