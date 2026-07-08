import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublicReview } from '~/server/utils/review-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  const reviewId = getRouterParam(event, 'reviewId')
  if (!siteId || !slug || !reviewId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const review = await getPublicReview(db, siteId, slug, reviewId)
  if (!review) return jsonResponse({ error: 'Review not found' }, { status: 404 })

  return jsonResponse({ review })
})
