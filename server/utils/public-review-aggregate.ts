export interface PublicReviewAggregateRow {
  rating: number | string | null
}

export interface PublicReviewAggregateLocation {
  rating: number | null
  review_count: number | null
  last_synced_at: string | null
}

export interface PublicReviewAggregate {
  rating: number
  review_count: number
  distribution: Array<{ star: number; count: number }>
}

export function buildPublicReviewAggregate(
  reviews: readonly PublicReviewAggregateRow[],
  location: PublicReviewAggregateLocation,
): PublicReviewAggregate | null {
  if (reviews.length > 0) {
    const ratings = reviews.map(review => Number(review.rating))
    return {
      rating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
      review_count: reviews.length,
      distribution: [1, 2, 3, 4, 5].map(star => ({
        star,
        count: ratings.filter(rating => rating === star).length,
      })),
    }
  }

  if (!location.last_synced_at || location.rating == null || location.review_count == null) return null

  return {
    rating: location.rating,
    review_count: location.review_count,
    distribution: [1, 2, 3, 4, 5].map(star => ({ star, count: 0 })),
  }
}
