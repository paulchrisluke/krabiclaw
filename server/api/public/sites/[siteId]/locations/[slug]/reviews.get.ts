// GET /api/public/sites/[siteId]/locations/[slug]/reviews
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await db.prepare(
    `SELECT id, rating, review_count FROM business_locations
     WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`
  ).bind(siteId, slug).first()
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })

  const { results } = await db.prepare(
    `SELECT id, author_name, reviewer_photo_url, rating, title, content,
            owner_reply, owner_reply_at, photo_urls, source, created_at
     FROM reviews
     WHERE location_id = ? AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(location.id).all()

  const reviews = (results ?? []).map((r: ApiValue) => ({
    ...r,
    photo_urls: r.photo_urls ? JSON.parse(r.photo_urls) : [],
  }))

  // Compute star distribution from stored reviews
  const dist = [1, 2, 3, 4, 5].map(star => ({
    star,
    count: reviews.filter((r: ApiValue) => r.rating === star).length,
  }))

  return jsonResponse({
    aggregate: {
      rating: location.rating,
      review_count: location.review_count,
      distribution: dist,
    },
    reviews,
  })
})
