import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { execute, queryFirst } from '~/server/db'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  const reviewId = getRouterParam(event, 'reviewId')
  if (!siteId || !slug || !reviewId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const review = await queryFirst<{ id: string; helpful_count: number | null }>(db, `
    SELECT r.id, r.helpful_count
    FROM reviews r
    JOIN business_locations bl ON bl.id = r.location_id
    WHERE r.id = ? AND r.site_id = ? AND bl.slug = ? AND r.status = 'approved'
    LIMIT 1
  `, [reviewId, siteId, slug])
  if (!review) return jsonResponse({ error: 'Review not found' }, { status: 404 })

  const ipHash = await hashClientIp(getClientIp(event))
  const allowed = await incrementHourlyRateLimit(db, `rate:review-helpful:${reviewId}:${ipHash}`, 1, 10 * 365 * 86_400_000)
  if (!allowed) return jsonResponse({ helpful: false, helpfulCount: review.helpful_count ?? 0 })

  const updated = await queryFirst<{ helpful_count: number }>(db, `
    UPDATE reviews
    SET helpful_count = COALESCE(helpful_count, 0) + 1,
        updated_at = ?
    WHERE id = ?
    RETURNING helpful_count
  `, [new Date().toISOString(), reviewId])

  return jsonResponse({ helpful: true, helpfulCount: updated?.helpful_count ?? (review.helpful_count ?? 0) + 1 })
})
