// GET /api/editor/sites/[organizationId]/reservation-submissions
import { jsonResponse } from '~/server/utils/api-response'
import { listReservationSubmissions } from '~/server/utils/mcp-workflows'
import { queryFirst } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertResourceAccess, memberAccessPrincipal } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })
  const { env, db, site } = await requireSiteAccess(event, organizationId, 'context')

  const query = getQuery(event)
  const locationId = typeof query.location_id === 'string' && query.location_id.trim()
    ? query.location_id.trim()
    : null

  if (locationId) {
    const location = await queryFirst<{ id: string }>(
      db, `SELECT id FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1`, [locationId, organizationId], )
    if (!location) return jsonResponse({ error: 'location_id must reference a location on this site' }, { status: 400 })
  }
  await assertResourceAccess(db, { ...memberAccessPrincipal(site.membership, { env, organizationId, event }), resourceLocationId: locationId })

  const submissions = await listReservationSubmissions(db, organizationId, { locationId })
  return jsonResponse({ submissions })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
