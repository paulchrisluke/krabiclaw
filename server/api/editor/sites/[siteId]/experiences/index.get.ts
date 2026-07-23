import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listExperiences } from '~/server/utils/experiences'
import { assertResourceAccess, listAccessibleLocationIds } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

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

  const query = getQuery(event)
  const locationId = typeof query.location_id === 'string' && query.location_id ? query.location_id : null
  if (locationId) {
    const location = await queryFirst<{ id: string }>(
      db,
      `SELECT id FROM business_locations WHERE id = ? AND site_id = ? AND organization_id = ? LIMIT 1`,
      [locationId, siteId, site.organization_id],
    )
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
    await assertResourceAccess(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      resourceLocationId: locationId,
    })
    return jsonResponse({ experiences: await listExperiences(db, siteId, { locationId }) })
  }

  // A location-scoped editor sees only experiences at their own location(s),
  // rather than every experience across the whole site — null means
  // unrestricted (org-wide role, or a site-wide-scoped editor).
  const accessibleLocationIds = await listAccessibleLocationIds(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  })
  const experiences = (await listExperiences(db, siteId))
    .filter(experience => accessibleLocationIds === null || accessibleLocationIds.includes(experience.location_id))
  return jsonResponse({ experiences })
})
