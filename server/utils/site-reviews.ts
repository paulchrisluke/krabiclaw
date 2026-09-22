import { parseGoogleReviewMetadata } from '~/shared/google-review'
import { queryAll, type DbClient } from '../db/index.ts'
import { loadPublicSocialMedia } from './public-social-image.ts'


function publicReviewRow(row: Record<string, unknown>): Record<string, unknown> & { publication_authorized: boolean; verified: boolean } {
  return {
    ...row,
    google_review_metadata: parseGoogleReviewMetadata(row.google_review_metadata),
    publication_authorized: Boolean(row.publication_authorized),
    verified: row.source === 'direct' && typeof row.review_request_id === 'string' && Boolean(row.review_request_id),
  }
}

export async function listSiteReviews(db: DbClient, organizationId: string, options: { publishedOnly?: boolean; locationId?: string | null } = {}) {
  const rows = await queryAll<Record<string, unknown>>(db, `
    SELECT r.id, r.organization_id, r.location_id, r.author_name,
           r.rating, r.title, r.content, r.owner_reply, r.owner_reply_at, r.helpful_count, r.status, r.source,
           review_request_id, entered_by_user_id, collection_method, original_review_date,
           original_reference, google_review_metadata, publication_authorized, created_at, updated_at
    FROM reviews r
    WHERE r.organization_id = ? AND ${options.locationId ? 'r.location_id = ?' : 'r.location_id IS NULL'}${options.publishedOnly ? " AND r.status = 'approved'" : ''}
    ORDER BY CASE WHEN r.source = 'google_places' THEN r.original_review_date ELSE r.created_at END DESC, r.id ASC
  `, options.locationId ? [organizationId, options.locationId] : [organizationId])
  return await attachReviewMedia(db, organizationId, rows.map(publicReviewRow))
}

export async function attachReviewMedia<T extends Record<string, unknown>>(db: DbClient, organizationId: string, reviews: T[]) {
  const placements = await loadPublicSocialMedia(db, organizationId, 'review', reviews.map(review => String(review.id)))
  return reviews.map(review => {
    const socialMedia = placements.get(String(review.id)) ?? { media: [], social_image: null }
    return { ...review, ...socialMedia }
  })
}
