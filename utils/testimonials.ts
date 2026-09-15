// The owner-entered testimonial as the editor endpoint returns it.
import {
  OWNER_REVIEW_COLLECTION_METHODS,
  OWNER_REVIEW_COLLECTION_METHOD_LABELS,
  OWNER_REVIEW_STATUSES,
  type OwnerReviewCollectionMethod as CollectionMethod,
  type OwnerReviewStatus as TestimonialStatus,
} from '~/shared/site-reviews'

export type { CollectionMethod, TestimonialStatus }

export interface SiteTestimonial {
  id: string
  author_name: string
  rating: number
  title: string | null
  content: string
  collection_method: CollectionMethod | null
  original_review_date: string | null
  original_reference: string | null
  publication_authorized: boolean
  status: TestimonialStatus
}

export const COLLECTION_METHOD_LABELS = OWNER_REVIEW_COLLECTION_METHOD_LABELS

const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'

export const isSiteTestimonial = (value: unknown): value is SiteTestimonial =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.author_name === 'string'
  && typeof value.rating === 'number'
  && typeof value.content === 'string'
  && isStringOrNull(value.title)
  && (value.collection_method === null || OWNER_REVIEW_COLLECTION_METHODS.some(method => method === value.collection_method))
  && isStringOrNull(value.original_review_date)
  && isStringOrNull(value.original_reference)
  && typeof value.publication_authorized === 'boolean'
  && OWNER_REVIEW_STATUSES.some(status => status === value.status)

export const isTestimonialsResponse = (value: unknown): value is { reviews: SiteTestimonial[] } =>
  isRecord(value) && Array.isArray(value.reviews) && value.reviews.every(isSiteTestimonial)
