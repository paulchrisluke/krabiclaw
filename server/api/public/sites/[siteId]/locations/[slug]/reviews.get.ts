// GET /api/public/sites/[siteId]/locations/[slug]/reviews
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildPublicReviewAggregate,
  normalizePublicReviewAggregateRows,
} from '~/server/utils/public-review-aggregate'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await queryFirst<{ id: string; rating: number | null; review_count: number | null; last_synced_at: string | null }>(
    db,
    `SELECT id, rating, review_count, last_synced_at FROM business_locations
     WHERE site_id = ? AND slug = ? AND status = 'active' LIMIT 1`
    ,
    [siteId, slug],
  )
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })
  const results = await queryAll<ApiValue>(
    db,
    `SELECT id, author_name, reviewer_photo_url, rating, title, content,
            owner_reply, owner_reply_at, photo_urls, source, helpful_count, created_at
     FROM reviews
     WHERE location_id = ? AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT 50`
    ,
    [location.id],
  )
  const aggregateResults = await queryAll<{ rating: number | string | null }>(
    db,
    `SELECT rating
     FROM reviews
     WHERE location_id = ? AND status = 'approved'`,
    [location.id],
  )

  const reviews = (results ?? []).map((r: ApiValue) => ({
    ...r,
    photo_urls: r.photo_urls ? JSON.parse(r.photo_urls) : [],
  }))

  return jsonResponse({
    aggregate: buildPublicReviewAggregate(normalizePublicReviewAggregateRows(aggregateResults), location),
    reviews,
  })
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
