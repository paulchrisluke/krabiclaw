import { execute, queryAll, queryFirst, type DbClient, type QueryResultRow } from '~/server/db'

export async function getPublicReview(db: DbClient, siteId: string, locationSlug: string, reviewId: string) {
  const review = await queryFirst<QueryResultRow>(db, `
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
  `, [reviewId, siteId, locationSlug])
  if (!review) return null

  const media = await queryAll<QueryResultRow>(db, `
    SELECT ma.id, ma.kind, ma.public_url, ma.thumbnail_url, ma.alt_text, ma.mime_type, rm.sort_order
    FROM review_media rm
    JOIN media_assets ma ON ma.id = rm.media_asset_id
    WHERE rm.review_id = ?
      AND rm.status = 'approved'
      AND ma.status = 'active'
    ORDER BY rm.sort_order ASC, rm.created_at ASC
  `, [reviewId])

  return {
    ...review,
    photo_urls: review.photo_urls ? JSON.parse(String(review.photo_urls)) : [],
    media,
  }
}

export async function replyToReview(
  db: DbClient,
  organizationId: string,
  siteId: string,
  reviewId: string,
  reply: string | null,
) {
  const now = new Date().toISOString()
  const trimmedReply = typeof reply === "string" ? reply.trim() : null
  const ownerReplyAt = trimmedReply ? now : null
  const result = await execute(db, `
    UPDATE reviews
    SET owner_reply = ?, owner_reply_at = ?, updated_at = ?
    WHERE id = ? AND site_id = ? AND organization_id = ?
  `, [trimmedReply, ownerReplyAt, now, reviewId, siteId, organizationId])

  if (!Number(result.meta.changes ?? 0)) {
    return { status: 404, data: { error: 'Review not found.' } }
  }

  return {
    status: 200,
    data: {
      review_id: reviewId,
      reply: trimmedReply,
      replied: Boolean(trimmedReply),
      cleared: !trimmedReply,
      updated_at: now,
    },
  }
}
