import { jsonResponse } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const reviewId = getRouterParam(event, 'reviewId')

  if (!siteId || !locationId || !reviewId) {
    return jsonResponse({ error: 'Site ID, location ID, and review ID are required' }, { status: 400 })
  }

  const { db } = await requireLocationAccess(event, siteId, locationId, ['owner', 'admin'])

  const result = await db.prepare(`
    DELETE FROM reviews
    WHERE id = ? AND site_id = ? AND location_id = ?
  `).bind(reviewId, siteId, locationId).run()

  if (!result.meta.changes) {
    return jsonResponse({ error: 'Review not found' }, { status: 404 })
  }

  return jsonResponse({ success: true })
})

