import { parseGoogleReviewMetadata } from '~/shared/google-review'
import { queryFirst, type DbClient, type QueryResultRow } from '~/server/db'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'

export async function getPublicReview(db: DbClient, siteId: string, locationSlug: string, reviewId: string) {
  const review = await queryFirst<QueryResultRow>(db, `
    SELECT r.id, r.author_name, r.rating, r.title, r.content,
           r.owner_reply, r.owner_reply_at, r.source, r.created_at, r.original_review_date, r.original_reference, r.google_review_metadata,
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
    google_review_metadata: parseGoogleReviewMetadata(review.google_review_metadata),
    media: socialMedia?.media ?? [],
    social_image: socialMedia?.social_image ?? null,
  }
}
