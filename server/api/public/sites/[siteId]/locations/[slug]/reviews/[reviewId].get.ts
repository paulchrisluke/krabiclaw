import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  const reviewId = getRouterParam(event, 'reviewId')
  if (!siteId || !slug || !reviewId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const review = await queryFirst<ApiRecord>(db, `
    SELECT r.id, r.author_name, r.reviewer_photo_url, r.rating, r.title, r.content,
           r.owner_reply, r.owner_reply_at, r.photo_urls, r.source, r.created_at,
           r.helpful_count, bl.title AS location_title, bl.slug AS location_slug,
           s.brand_name AS site_name
    FROM reviews r
    JOIN business_locations bl ON bl.id = r.location_id
    JOIN sites s ON s.id = r.site_id
    WHERE r.id = ?
      AND r.site_id = ?
      AND bl.slug = ?
      AND r.status = 'approved'
    LIMIT 1
  `, [reviewId, siteId, slug])
  if (!review) return jsonResponse({ error: 'Review not found' }, { status: 404 })

  const media = await queryAll<ApiRecord>(db, `
    SELECT ma.id, ma.kind, ma.public_url, ma.thumbnail_url, ma.alt_text, ma.mime_type, rm.sort_order
    FROM review_media rm
    JOIN media_assets ma ON ma.id = rm.media_asset_id
    WHERE rm.review_id = ?
      AND rm.status = 'approved'
      AND ma.status = 'active'
    ORDER BY rm.sort_order ASC, rm.created_at ASC
  `, [reviewId])

  return jsonResponse({
    review: {
      ...review,
      photo_urls: review.photo_urls ? JSON.parse(String(review.photo_urls)) : [],
      media,
    },
  })
})
