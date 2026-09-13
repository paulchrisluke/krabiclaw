import type { GoogleReviewMetadata } from '~/shared/google-review'

/** A review row as the reviews API and the product payload carry it. */
export interface ReviewRow {
  id: string | number
  author_name: string | null
  rating: number
  content: string | null
  title?: string | null
  source?: string | null
  original_reference?: string | null
  google_review_metadata?: GoogleReviewMetadata | null
  /** When an imported review was written; a Google review is dated by this. */
  original_review_date?: string | null
  /** When the row was written here; a review written on this site is dated by this. */
  created_at?: string | null
  media?: Array<{ slot: string; public_url?: string | null }>
}

/**
 * The one shape SayaReviewCard renders, from the one row shape reviews have.
 * A review is dated when it was written: a Google review by its Google
 * publish time, a review written here by its row. No date, no date line.
 */
export function reviewCard(
  review: ReviewRow,
  formatDate: (_value: string) => string,
  options: { content?: string; locationTitle?: string | null } = {},
) {
  const writtenAt = review.source === 'google_places' ? review.original_review_date : review.created_at
  return {
    id: review.id,
    author: review.author_name ?? '',
    rating: review.rating,
    content: options.content ?? review.content ?? '',
    title: review.title ?? null,
    dateLabel: writtenAt ? formatDate(writtenAt) : null,
    source: review.source ?? null,
    original_reference: review.original_reference ?? null,
    google_review_metadata: review.google_review_metadata ?? null,
    media: review.media,
    locationTitle: options.locationTitle ?? null,
  }
}
