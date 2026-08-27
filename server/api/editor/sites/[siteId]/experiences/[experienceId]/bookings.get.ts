import { jsonResponse } from '~/server/utils/api-response'
import { listExperienceBookings } from '~/server/utils/experiences'
import { assertResourceAccess } from '~/server/utils/member-access'
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const experienceId = getRouterParam(event, 'experienceId')
  if (!siteId || !experienceId) return jsonResponse({ error: 'siteId and experienceId required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')

  const experience = await queryFirst<{ location_id: string }>(db, `SELECT location_id FROM experiences WHERE id = ? AND site_id = ? LIMIT 1`, [experienceId, siteId])
  if (!experience) return jsonResponse({ error: 'Experience not found' }, { status: 404 })

  await assertResourceAccess(db, {
    env,
    memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId, resourceLocationId: experience.location_id, })

  const query = getQuery(event)
  const locationId = typeof query.location_id === 'string' && query.location_id.trim()
    ? query.location_id.trim()
    : null

  if (locationId) {
    const location = await queryFirst<{ id: string }>(
      db, `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`, [locationId, siteId], )
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
  }

  const bookings = await listExperienceBookings(db, siteId, experienceId, { locationId })
  return jsonResponse({ bookings })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
