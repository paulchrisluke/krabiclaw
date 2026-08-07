import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPublicReviewAggregate } from '../../server/utils/public-review-aggregate.ts'

test('review rows own the aggregate when location metadata is not a verified sync', () => {
  const aggregate = buildPublicReviewAggregate(
    [{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 5 }, { rating: 4 }, { rating: 3 }],
    { rating: 4.8, review_count: 188, last_synced_at: null },
  )

  assert.deepEqual(aggregate, {
    rating: 26 / 6,
    review_count: 6,
    distribution: [
      { star: 1, count: 0 },
      { star: 2, count: 0 },
      { star: 3, count: 1 },
      { star: 4, count: 2 },
      { star: 5, count: 3 },
    ],
  })
})

test('verified location metadata remains the aggregate-only source when no rows exist', () => {
  assert.deepEqual(
    buildPublicReviewAggregate([], { rating: 4.8, review_count: 188, last_synced_at: '2026-08-07T00:00:00.000Z' }),
    {
      rating: 4.8,
      review_count: 188,
      distribution: [1, 2, 3, 4, 5].map(star => ({ star, count: 0 })),
    },
  )
})
