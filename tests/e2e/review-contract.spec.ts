import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { tenantExtraHeaders } from './helpers'

const DEMO_USER_ID = 'user-e2e-demo-owner'
const DEMO_SITE_ID = 'site-demo'
const DEMO_LOCATION_ID = 'loc-demo'

test.describe('review contract regressions', () => {
  test.describe.configure({ mode: 'serial' })

  test('manual review create route is removed (returns 404)', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, DEMO_USER_ID)

    const res = await request.post(
      `${baseURL}/api/sites/${DEMO_SITE_ID}/locations/${DEMO_LOCATION_ID}/reviews`,
      {
        headers: tenantExtraHeaders,
        data: {
          author_name: 'E2E Ghost Author',
          rating: 5,
          content: 'This should not be creatable',
          source: 'manual',
          status: 'published',
        },
      },
    )
    expect(res.status()).toBe(404)
  })

  test('manual review edit route is removed (returns 404)', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, DEMO_USER_ID)

    const res = await request.patch(
      `${baseURL}/api/sites/${DEMO_SITE_ID}/locations/${DEMO_LOCATION_ID}/reviews/fake-review-id`,
      {
        headers: tenantExtraHeaders,
        data: { content: 'should not be editable' },
      },
    )
    expect(res.status()).toBe(404)
  })

  test('manual review delete route is removed (returns 404)', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, DEMO_USER_ID)

    const res = await request.delete(
      `${baseURL}/api/sites/${DEMO_SITE_ID}/locations/${DEMO_LOCATION_ID}/reviews/fake-review-id`,
      { headers: tenantExtraHeaders },
    )
    expect(res.status()).toBe(404)
  })

  test('editor reply route enforces owner/admin — owner can reply, editor cannot', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!, DEMO_USER_ID)

    // Get reviews for the seeded demo location
    const reviewsRes = await request.get(
      `${baseURL}/api/sites/${DEMO_SITE_ID}/locations/${DEMO_LOCATION_ID}/reviews`,
      { headers: tenantExtraHeaders },
    )
    expect(reviewsRes.status()).toBe(200)
    const reviewsBody = await reviewsRes.json() as { reviews: Array<{ id: string }> }
    const reviews = reviewsBody.reviews ?? []
    expect(reviews.length).toBeGreaterThan(0)

    const reviewId = reviews[0]!.id

    // Owner can reply
    const ownerReply = `E2E owner reply ${Date.now()}`
    const ownerReplyRes = await request.patch(
      `${baseURL}/api/editor/sites/${DEMO_SITE_ID}/reviews/${reviewId}`,
      {
        headers: tenantExtraHeaders,
        data: { owner_reply: ownerReply },
        maxRetries: 1,
      },
    )
    expect(ownerReplyRes.status()).toBe(200)
    const ownerBody = await ownerReplyRes.json() as { updated: boolean }
    expect(ownerBody.updated).toBe(true)

    const persistedReviewsRes = await request.get(
      `${baseURL}/api/sites/${DEMO_SITE_ID}/locations/${DEMO_LOCATION_ID}/reviews`,
      { headers: tenantExtraHeaders, maxRetries: 1 },
    )
    expect(persistedReviewsRes.status()).toBe(200)
    const persistedReviewsBody = await persistedReviewsRes.json() as { reviews: Array<{ id: string; owner_reply: string | null }> }
    expect(persistedReviewsBody.reviews.find(review => review.id === reviewId)?.owner_reply).toBe(ownerReply)

    // Editor cannot reply — editor is not in the ['owner', 'admin'] access list
    await loginAs(request, baseURL!, 'user-e2e-demo-editor')
    const editorReplyRes = await request.patch(
      `${baseURL}/api/editor/sites/${DEMO_SITE_ID}/reviews/${reviewId}`,
      {
        headers: tenantExtraHeaders,
        data: { owner_reply: 'editor should not be able to do this' },
      },
    )
    expect(editorReplyRes.status()).toBe(403)
  })
})
