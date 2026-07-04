// GET /api/editor/sites/[siteId]/experience-bookings
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listExperienceBookingsForSite } from '~/server/utils/experiences'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst(
    db,
    `SELECT s.organization_id FROM sites s JOIN member m ON s.organization_id = m.organizationId
     WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor') LIMIT 1`,
    [siteId, session.user.id],
  )
  if (!site) return jsonResponse({ error: 'Access denied' }, { status: 403 })

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

  const bookings = await listExperienceBookingsForSite(db, siteId, { locationId })
  return jsonResponse({ bookings })
})
