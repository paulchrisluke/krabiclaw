import { jsonResponse } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const { db } = await requireLocationAccess(event, siteId, locationId)

  const { results } = await db.prepare(`
    SELECT id, author_name, reviewer_photo_url, rating, title, content, owner_reply,
           owner_reply_at, photo_urls, source, status, created_at, updated_at
    FROM reviews
    WHERE site_id = ? AND location_id = ?
    ORDER BY created_at DESC
  `).bind(siteId, locationId).all()

  const safeParsePhotoUrls = (photoUrls: unknown): string[] => {
    if (typeof photoUrls !== 'string' || !photoUrls.trim()) return []
    try {
      const parsed = JSON.parse(photoUrls)
      return Array.isArray(parsed)
        ? parsed.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean)
        : []
    } catch {
      return []
    }
  }

  const reviews = (results ?? []).map((review: ApiValue) => ({
    ...review,
    photo_urls: safeParsePhotoUrls(review.photo_urls)
  }))

  return jsonResponse({ success: true, reviews })
})
