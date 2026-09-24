// GET /api/public/locations/[slug]/reviews
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildPublicReviewAggregate, normalizePublicReviewAggregateRows, } from '~/server/utils/public-review-aggregate'
import { attachReviewMedia } from '~/server/utils/organization-reviews'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  const slug = getRouterParam(event, 'slug')
  if (!organizationId || !slug) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const location = await queryFirst<{ id: string; rating: number | null; review_count: number | null; last_synced_at: string | null }>(
    db, `SELECT id, rating, review_count, last_synced_at FROM business_locations
     WHERE organization_id = ? AND slug = ? AND status = 'active' LIMIT 1`, [organizationId, slug], )
  if (!location) return jsonResponse({ error: 'Location not found' }, { status: 404 })
  const results = await queryAll<ApiValue>(
    db, `SELECT r.id, r.author_name, r.rating, r.title, r.content, r.owner_reply, r.owner_reply_at,
       r.source, r.helpful_count, r.created_at
     FROM reviews r
     WHERE r.location_id = ? AND r.status = 'approved'
     ORDER BY r.created_at DESC
     LIMIT 50`, [location.id], )
  const aggregateResults = await queryAll<{ rating: number | string | null }>(
    db, `SELECT rating
     FROM reviews
     WHERE location_id = ? AND status = 'approved'`, [location.id], )

  const reviews = await attachReviewMedia(db, organizationId, (results ?? []) as Array<Record<string, unknown>>)

  return jsonResponse({
    aggregate: buildPublicReviewAggregate(normalizePublicReviewAggregateRows(aggregateResults), location), reviews, })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
