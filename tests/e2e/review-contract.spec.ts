import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'

const POTTERY_HOUSE_USER_ID = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'
const POTTERY_HOUSE_SITE_ID = 'site-pottery-house'
const POTTERY_HOUSE_LOCATION_ID = 'loc-pottery-house'
const POTTERY_HOUSE_ORG_ID = 'org-pottery-house'

async function loginAs(request: APIRequestContext, baseURL: string, userId?: string) {
  const res = await request.get(devLoginUrl(baseURL, userId), {
    headers: devLoginHeaders(),
    maxRedirects: 0,
  })
  expect(res.status()).toBe(302)
}

test.describe('review contract regressions', () => {
  test.describe.configure({ mode: 'serial' })

  test('manual review create route is removed (returns 404)', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)

    const res = await request.post(
      `${baseURL}/api/sites/${POTTERY_HOUSE_SITE_ID}/locations/${POTTERY_HOUSE_LOCATION_ID}/reviews`,
      {
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
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)

    const res = await request.patch(
      `${baseURL}/api/sites/${POTTERY_HOUSE_SITE_ID}/locations/${POTTERY_HOUSE_LOCATION_ID}/reviews/fake-review-id`,
      { data: { content: 'should not be editable' } },
    )
    expect(res.status()).toBe(404)
  })

  test('manual review delete route is removed (returns 404)', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)

    const res = await request.delete(
      `${baseURL}/api/sites/${POTTERY_HOUSE_SITE_ID}/locations/${POTTERY_HOUSE_LOCATION_ID}/reviews/fake-review-id`,
    )
    expect(res.status()).toBe(404)
  })

  test('editor reply route enforces owner/admin — owner can reply, editor cannot', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)

    // Get reviews for the pottery house location
    const reviewsRes = await request.get(
      `${baseURL}/api/sites/${POTTERY_HOUSE_SITE_ID}/locations/${POTTERY_HOUSE_LOCATION_ID}/reviews`,
    )
    expect(reviewsRes.status()).toBe(200)
    const reviewsBody = await reviewsRes.json() as { reviews: Array<{ id: string }> }
    const reviews = reviewsBody.reviews ?? []

    if (reviews.length === 0) {
      test.skip()
    }

    const reviewId = reviews[0]!.id

    // Owner can reply
    const ownerReplyRes = await request.patch(
      `${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/reviews/${reviewId}`,
      { data: { owner_reply: `E2E owner reply ${Date.now()}` } },
    )
    expect(ownerReplyRes.status()).toBe(200)
    const ownerBody = await ownerReplyRes.json() as { updated: boolean }
    expect(ownerBody.updated).toBe(true)

    // Create an editor user in the pottery house org
    const editorRes = await request.post(`${baseURL}/api/dev/test-member`, {
      data: { role: 'editor', organizationId: POTTERY_HOUSE_ORG_ID },
      headers: devLoginHeaders(),
    })
    expect(editorRes.status()).toBe(200)
    const editorBody = await editorRes.json() as { user: { id: string } }
    const editorId = editorBody.user.id

    // Editor cannot reply — editor is not in the ['owner', 'admin'] access list
    await loginAs(request, baseURL!, editorId)
    const editorReplyRes = await request.patch(
      `${baseURL}/api/editor/sites/${POTTERY_HOUSE_SITE_ID}/reviews/${reviewId}`,
      { data: { owner_reply: 'editor should not be able to do this' } },
    )
    expect(editorReplyRes.status()).toBe(404)
  })
})
