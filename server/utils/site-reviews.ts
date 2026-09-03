import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '../db/index.ts'
import { loadPublicSocialMedia } from './public-social-image.ts'
import type { CloudflareEnv } from '~/server/utils/auth'
import { refreshSocialCard } from '~/server/utils/social-card'

export const OWNER_REVIEW_COLLECTION_METHODS = ['in_person', 'email', 'phone', 'migration', 'other'] as const
export type OwnerReviewCollectionMethod = typeof OWNER_REVIEW_COLLECTION_METHODS[number]

export interface OwnerEnteredReviewInput {
  author_name: unknown
  rating: unknown
  title?: unknown
  content: unknown
  collection_method: unknown
  original_review_date?: unknown
  original_reference?: unknown
  publication_authorized: unknown
  status?: unknown
}

function optionalString(value: unknown, maxLength: number) {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('value must be a string or null')
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function requiredString(value: unknown, field: string, maxLength: number) {
  const normalized = optionalString(value, maxLength)
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function parseRating(value: unknown) {
  if (typeof value !== 'number') throw new Error('rating must be an integer from 1 through 5')
  const rating = value
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('rating must be an integer from 1 through 5')
  return rating
}

function parseCollectionMethod(value: unknown): OwnerReviewCollectionMethod {
  if (typeof value !== 'string') throw new Error('collection_method is invalid')
  const method = value as OwnerReviewCollectionMethod
  if (!OWNER_REVIEW_COLLECTION_METHODS.includes(method)) throw new Error('collection_method is invalid')
  return method
}

function parseStatus(value: unknown) {
  if (value != null && typeof value !== 'string') throw new Error('status is invalid')
  const status = value ?? 'pending'
  if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('status is invalid')
  return status
}

function publicReviewRow(row: Record<string, unknown>): Record<string, unknown> & { publication_authorized: boolean; verified: boolean } {
  return {
    ...row,
    publication_authorized: Boolean(row.publication_authorized),
    verified: row.source === 'direct' && typeof row.review_request_id === 'string' && Boolean(row.review_request_id),
  }
}

export async function listSiteReviews(db: DbClient, siteId: string, options: { publishedOnly?: boolean } = {}) {
  const rows = await queryAll<Record<string, unknown>>(db, `
    SELECT r.id, r.organization_id, r.site_id, r.location_id, r.author_name,
           r.rating, r.title, r.content, r.owner_reply, r.owner_reply_at, r.helpful_count, r.status, r.source,
           review_request_id, entered_by_user_id, collection_method, original_review_date,
           original_reference, publication_authorized, created_at, updated_at
    FROM reviews r
    WHERE r.site_id = ? AND r.location_id IS NULL${options.publishedOnly ? " AND r.status = 'approved'" : ''}
    ORDER BY r.created_at DESC, r.id ASC
  `, [siteId])
  return await attachReviewMedia(db, siteId, rows.map(publicReviewRow))
}

export async function attachReviewMedia<T extends Record<string, unknown>>(db: DbClient, siteId: string, reviews: T[]) {
  const placements = await loadPublicSocialMedia(db, siteId, 'review', reviews.map(review => String(review.id)))
  return reviews.map(review => {
    const socialMedia = placements.get(String(review.id)) ?? { media: [], social_image: null }
    return { ...review, ...socialMedia }
  })
}

export async function createOwnerEnteredSiteReview(
  db: DbClient,
  scope: { organizationId: string; siteId: string; enteredByUserId: string; env: CloudflareEnv },
  input: OwnerEnteredReviewInput,
) {
  if (input.publication_authorized !== true) throw new Error('publication_authorized must be explicitly accepted')
  const authorName = requiredString(input.author_name, 'author_name', 120)
  const content = requiredString(input.content, 'content', 4000)
  const rating = parseRating(input.rating)
  const collectionMethod = parseCollectionMethod(input.collection_method)
  const status = parseStatus(input.status)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO reviews (
      id, organization_id, site_id, location_id, author_name, rating, title, content,
      status, source, entered_by_user_id, collection_method, original_review_date,
      original_reference, publication_authorized, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'owner_entered', ?, ?, ?, ?, 1, ?, ?)
  `, [
    id,
    scope.organizationId,
    scope.siteId,
    authorName,
    rating,
    optionalString(input.title, 160),
    content,
    status,
    scope.enteredByUserId,
    collectionMethod,
    optionalString(input.original_review_date, 40),
    optionalString(input.original_reference, 500),
    now,
    now,
  ])
  if (status === 'approved') await refreshSocialCard({ db, env: scope.env, owner: { owner_type: 'review', owner_id: id }, actorId: scope.enteredByUserId })
  return { id, created: true, verified: false }
}

export async function updateOwnerEnteredSiteReview(
  db: DbClient,
  scope: { organizationId: string; siteId: string; env: CloudflareEnv },
  reviewId: string,
  input: Partial<OwnerEnteredReviewInput>,
) {
  const sets = ['updated_at = ?']
  const params: unknown[] = [new Date().toISOString()]
  const fields: Array<[keyof OwnerEnteredReviewInput, string, (_value: unknown) => unknown]> = [
    ['author_name', 'author_name', value => requiredString(value, 'author_name', 120)],
    ['rating', 'rating', parseRating],
    ['title', 'title', value => optionalString(value, 160)],
    ['content', 'content', value => requiredString(value, 'content', 4000)],
    ['collection_method', 'collection_method', parseCollectionMethod],
    ['original_review_date', 'original_review_date', value => optionalString(value, 40)],
    ['original_reference', 'original_reference', value => optionalString(value, 500)],
    ['status', 'status', parseStatus],
  ]
  for (const [key, column, parse] of fields) {
    if (input[key] === undefined) continue
    sets.push(`${column} = ?`)
    params.push(parse(input[key]))
  }
  if (input.publication_authorized !== undefined) {
    if (input.publication_authorized !== true) throw new Error('publication_authorized cannot be revoked while the review is stored')
    sets.push('publication_authorized = 1')
  }
  if (sets.length === 1) throw new Error('No review fields provided')
  params.push(reviewId, scope.organizationId, scope.siteId)
  const result = await execute(db, `
    UPDATE reviews
    SET ${sets.join(', ')}
    WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id IS NULL AND source = 'owner_entered'
  `, params)
  if (!Number(result.meta.changes ?? 0)) throw new Error('Owner-entered review not found')
  const review = await queryFirst<{ status: string }>(db, `
    SELECT status FROM reviews
    WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id IS NULL AND source = 'owner_entered'
  `, [reviewId, scope.organizationId, scope.siteId])
  if (review?.status === 'approved') {
    await refreshSocialCard({ db, env: scope.env, owner: { owner_type: 'review', owner_id: reviewId } })
  }
  return { review_id: reviewId, updated: true, verified: false }
}

export async function deleteOwnerEnteredSiteReview(
  db: DbClient,
  scope: { organizationId: string; siteId: string },
  reviewId: string,
) {
  const [, result] = await executeBatch(db, [
    {
      // Scoped by the exact same owner-entered predicate as the reviews DELETE below,
      // so a reviewId that exists but isn't owner-entered (or belongs to another
      // org/site) never has its placements cleared while the review itself survives.
      query: `
      DELETE FROM media_placements
      WHERE owner_type = 'review' AND owner_id IN (
        SELECT id FROM reviews
        WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id IS NULL AND source = 'owner_entered'
      )
    `,
      params: [reviewId, scope.organizationId, scope.siteId],
    },
    {
      query: `
      DELETE FROM reviews
      WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id IS NULL AND source = 'owner_entered'
    `,
      params: [reviewId, scope.organizationId, scope.siteId],
    },
  ])
  if (!Number(result?.meta.changes ?? 0)) throw new Error('Owner-entered review not found')
  return { review_id: reviewId, deleted: true }
}
