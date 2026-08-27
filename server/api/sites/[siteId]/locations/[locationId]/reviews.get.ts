import { jsonResponse } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { queryAll } from '~/server/db'
import { attachReviewMedia } from '~/server/utils/site-reviews'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const { db } = await requireLocationAccess(event, siteId, locationId)

  const results = await queryAll<ApiValue>(db, `
    SELECT r.id, r.author_name, r.rating, r.title, r.content, r.owner_reply, r.owner_reply_at,
      r.source, r.status, r.helpful_count, r.customer_id, r.booking_id, r.booking_type, r.review_request_id, r.created_at, r.updated_at
    FROM reviews r
    WHERE r.site_id = ? AND r.location_id = ?
    ORDER BY r.created_at DESC
  `, [siteId, locationId])

  const reviews = await attachReviewMedia(db, siteId, (results ?? []) as Array<Record<string, unknown>>)

  return jsonResponse({ success: true, reviews })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
