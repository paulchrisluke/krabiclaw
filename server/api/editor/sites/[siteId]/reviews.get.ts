import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listSiteReviews } from '~/server/utils/site-reviews'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db } = await requireSiteAccess(event, siteId)
  const locationId = getQuery(event).location_id
  return jsonResponse({ reviews: await listSiteReviews(db, siteId, { locationId: typeof locationId === 'string' ? locationId : null }) })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam } from 'nitro/h3';
