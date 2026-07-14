import { expect, test } from '@playwright/test'
import { tenantExtraHeaders } from './helpers'
import { loginAs } from './helpers/auth'
import { devLoginHeaders } from './test-env'

const OWNER_USER_ID = 'user-demo'
const ORGANIZATION_ID = 'org-demo'
const SITE_ID = 'site-demo'
const LOCATION_ID = 'loc-demo'

test.describe('site-level Q&A and owner-entered reviews', () => {
  test.describe.configure({ mode: 'serial' })

  test('site Q&A lifecycle remains separate from location Q&A', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, OWNER_USER_ID)
    const suffix = Date.now()
    const createdIds: string[] = []
    try {
      for (const [question, sortOrder] of [[`Site question A ${suffix}`, 1], [`Site question B ${suffix}`, 2]] as const) {
        const create = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/qa`, {
          headers: tenantExtraHeaders,
          data: { question, answer: 'Site-wide answer', sort_order: sortOrder, status: 'published' },
        })
        expect(create.status()).toBe(201)
        const body = await create.json() as { id: string; location_id: null }
        expect(body.location_id).toBeNull()
        createdIds.push(body.id)
      }

      const reorder = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/qa/reorder`, {
        headers: tenantExtraHeaders,
        data: { updates: [{ id: createdIds[0], sort_order: 2 }, { id: createdIds[1], sort_order: 1 }] },
      })
      expect(reorder.status()).toBe(200)

      const siteList = await request.get(`${baseURL}/api/editor/sites/${SITE_ID}/qa`, { headers: tenantExtraHeaders })
      expect(siteList.status()).toBe(200)
      const siteBody = await siteList.json() as { qa: Array<{ id: string; location_id: string | null }> }
      expect(siteBody.qa.filter(item => createdIds.includes(item.id))).toHaveLength(2)
      expect(siteBody.qa.filter(item => createdIds.includes(item.id)).every(item => item.location_id === null)).toBe(true)

      const locationList = await request.get(`${baseURL}/api/editor/sites/${SITE_ID}/locations/${LOCATION_ID}/qa`, { headers: tenantExtraHeaders })
      const locationBody = await locationList.json() as { qa: Array<{ id: string }> }
      expect(locationBody.qa.some(item => createdIds.includes(item.id))).toBe(false)

      const publicList = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/qa`, { headers: tenantExtraHeaders })
      expect(publicList.status()).toBe(200)
      const publicBody = await publicList.json() as { qa: Array<{ id: string }> }
      expect(publicBody.qa.filter(item => createdIds.includes(item.id))).toHaveLength(2)
    } finally {
      await loginAs(request, baseURL!, OWNER_USER_ID)
      await Promise.all(createdIds.map(id => request.delete(`${baseURL}/api/editor/sites/${SITE_ID}/qa/${id}`, { headers: tenantExtraHeaders })))
    }
  })

  test('owner-entered reviews require provenance and never claim verification', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, OWNER_USER_ID)
    const payload = {
      author_name: `Site reviewer ${Date.now()}`,
      rating: 5,
      title: 'Helpful support',
      content: 'The team explained the process clearly and treated me with respect.',
      collection_method: 'in_person',
      original_review_date: '2026-07-01',
      original_reference: 'Signed intake feedback card',
      publication_authorized: true,
      status: 'approved',
    }
    let reviewId = ''
    try {
      const unauthorized = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/reviews`, {
        headers: tenantExtraHeaders,
        data: { ...payload, publication_authorized: false },
      })
      expect(unauthorized.status()).toBe(400)

      const create = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/reviews`, {
        headers: tenantExtraHeaders,
        data: payload,
      })
      expect(create.status()).toBe(201)
      const createBody = await create.json() as { id: string; verified: boolean }
      reviewId = createBody.id
      expect(createBody.verified).toBe(false)

      const update = await request.patch(`${baseURL}/api/editor/sites/${SITE_ID}/reviews/${reviewId}`, {
        headers: tenantExtraHeaders,
        data: { rating: 4, publication_authorized: true },
      })
      expect(update.status()).toBe(200)

      const list = await request.get(`${baseURL}/api/editor/sites/${SITE_ID}/reviews`, { headers: tenantExtraHeaders })
      const listBody = await list.json() as { reviews: Array<{ id: string; rating: number; location_id: null; verified: boolean; collection_method: string }> }
      const stored = listBody.reviews.find(review => review.id === reviewId)
      expect(stored).toMatchObject({ rating: 4, location_id: null, verified: false, collection_method: 'in_person' })

      const publicList = await request.get(`${baseURL}/api/public/sites/${SITE_ID}/reviews`, { headers: tenantExtraHeaders })
      const publicBody = await publicList.json() as { reviews: Array<{ id: string; verified: boolean }> }
      expect(publicBody.reviews.find(review => review.id === reviewId)?.verified).toBe(false)

      const editorMember = await request.post(`${baseURL}/api/dev/test-member`, {
        headers: devLoginHeaders(),
        data: { role: 'editor', organizationId: ORGANIZATION_ID },
      })
      const editorBody = await editorMember.json() as { user: { id: string } }
      await loginAs(request, baseURL!, editorBody.user.id)
      const editorCreate = await request.post(`${baseURL}/api/editor/sites/${SITE_ID}/reviews`, {
        headers: tenantExtraHeaders,
        data: payload,
      })
      expect([403, 404]).toContain(editorCreate.status())
    } finally {
      await loginAs(request, baseURL!, OWNER_USER_ID)
      if (reviewId) {
        const removed = await request.delete(`${baseURL}/api/editor/sites/${SITE_ID}/reviews/${reviewId}`, { headers: tenantExtraHeaders })
        expect(removed.status()).toBe(200)
      }
    }
  })
})
