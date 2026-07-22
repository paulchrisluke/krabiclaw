// GET /api/editor/sites/[siteId]/experience-bookings
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listExperienceBookingsForSite } from '~/server/utils/experiences'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

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

  // No location_id filter means every booking across the whole site — only a
  // site-wide-scoped member may see that; a location-scoped editor must
  // filter to their own location.
  await assertResourceAccess(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    resourceLocationId: locationId,
  })

  const bookings = await listExperienceBookingsForSite(db, siteId, { locationId })
  return jsonResponse({ bookings })
})
