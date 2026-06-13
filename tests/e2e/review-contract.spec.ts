import { expect, test } from '@playwright/test'
import { devLoginHeaders } from './test-env'
import { loginAs } from './helpers/auth'
import { tenantExtraHeaders } from './helpers'

const DEMO_USER_ID = 'user-demo'
const DEMO_SITE_ID = 'site-demo'
const DEMO_LOCATION_ID = 'loc-demo'
const DEMO_ORG_ID = 'org-demo'

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
    const ownerReplyRes = await request.patch(
      `${baseURL}/api/editor/sites/${DEMO_SITE_ID}/reviews/${reviewId}`,
      {
        headers: tenantExtraHeaders,
        data: { owner_reply: `E2E owner reply ${Date.now()}` },
      },
    )
    expect(ownerReplyRes.status()).toBe(200)
    const ownerBody = await ownerReplyRes.json() as { updated: boolean }
    expect(ownerBody.updated).toBe(true)

    // Create an editor user in the pottery house org
    const editorRes = await request.post(`${baseURL}/api/dev/test-member`, {
      data: { role: 'editor', organizationId: DEMO_ORG_ID },
      headers: devLoginHeaders(),
    })
    expect(editorRes.status()).toBe(200)
    const editorBody = await editorRes.json() as { user: { id: string } }
    const editorId = editorBody.user.id

    // Editor cannot reply — editor is not in the ['owner', 'admin'] access list
    await loginAs(request, baseURL!, editorId)
    const editorReplyRes = await request.patch(
      `${baseURL}/api/editor/sites/${DEMO_SITE_ID}/reviews/${reviewId}`,
      {
        headers: tenantExtraHeaders,
        data: { owner_reply: 'editor should not be able to do this' },
      },
    )
    expect(editorReplyRes.status()).toBe(404)
  })
})
