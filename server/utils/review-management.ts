import { execute, executeBatch, queryFirst, type DbClient, type QueryResultRow } from '~/server/db'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'
import { refreshSocialCard } from '~/server/utils/social-card'
import type { CloudflareEnv } from '~/server/utils/auth'

export async function getPublicReview(db: DbClient, siteId: string, locationSlug: string, reviewId: string) {
  const review = await queryFirst<QueryResultRow>(db, `
    SELECT r.id, r.author_name, r.rating, r.title, r.content,
           r.owner_reply, r.owner_reply_at, r.source, r.created_at,
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

  const socialMedia = (await loadPublicSocialMedia(db, siteId, 'review', [reviewId])).get(reviewId)

  return {
    ...review,
    media: socialMedia?.media ?? [],
    social_image: socialMedia?.social_image ?? null,
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

export type ReviewModerationStatus = 'pending' | 'approved' | 'rejected'

export function isReviewModerationStatus(value: unknown): value is ReviewModerationStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

export async function updateReviewModerationStatus(
  db: DbClient,
  scope: { siteId: string; env: CloudflareEnv },
  reviewId: string,
  status: ReviewModerationStatus,
) {
  const now = new Date().toISOString()
  const queries = [{
    query: 'UPDATE reviews SET status = ?, updated_at = ? WHERE id = ? AND site_id = ?',
    params: [status, now, reviewId, scope.siteId],
  }]
  if (status === 'approved' || status === 'rejected') {
    queries.push({
      query: `UPDATE media_placements SET status = ?, updated_at = ?
        WHERE owner_type = 'review' AND owner_id = ? AND site_id = ?`,
      params: [status === 'approved' ? 'active' : 'rejected', now, reviewId, scope.siteId],
    })
  }
  const [reviewUpdate] = await executeBatch(db, queries)
  if (!Number(reviewUpdate?.meta.changes ?? 0)) {
    return { status: 404, data: { error: 'Review not found' } }
  }
  if (status === 'approved') {
    await refreshSocialCard({ db, env: scope.env, owner: { owner_type: 'review', owner_id: reviewId } })
  }
  return { status: 200, data: { updated: true } }
}
