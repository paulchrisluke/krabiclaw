import { expect, test } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'

test.describe('site creation contracts', () => {
  test('legacy dashboard creation proxy requires an explicit vertical', async ({ request, baseURL }) => {
    const ownerLogin = await request.get(devLoginUrl(baseURL!), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(ownerLogin.status()).toBe(302)

    const suffix = Date.now()
    const missingVerticalRes = await request.post(`${baseURL}/api/dashboard/restaurant`, {
      data: {
        restaurantName: `Missing Vertical ${suffix}`,
        subdomain: `missing-vertical-${suffix}`,
      },
    })
    expect(missingVerticalRes.status()).toBe(400)
    expect(await missingVerticalRes.json()).toEqual({
      error: 'vertical is required and must be one of: restaurant, experience',
    })

    const invalidVerticalRes = await request.post(`${baseURL}/api/dashboard/restaurant`, {
      data: {
        restaurantName: `Invalid Vertical ${suffix}`,
        subdomain: `invalid-vertical-${suffix}`,
        vertical: 'invalid',
      },
    })
    expect(invalidVerticalRes.status()).toBe(400)
    expect(await invalidVerticalRes.json()).toEqual({
      error: 'vertical is required and must be one of: restaurant, experience',
    })
  })

  test('an authenticated user can create multiple site workspaces', async ({ request, baseURL }) => {
    const ownerLogin = await request.get(devLoginUrl(baseURL!), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(ownerLogin.status()).toBe(302)

    const suffix = Date.now()
    const firstRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Multi Site One ${suffix}`,
        subdomain: `multi-site-one-${suffix}`,
        vertical: 'restaurant',
      },
    })
    expect(firstRes.status()).toBe(200)
    const first = await firstRes.json() as { siteId: string; organizationId: string; subdomain: string }

    const secondRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Multi Site Two ${suffix}`,
        subdomain: `multi-site-two-${suffix}`,
        vertical: 'experience',
      },
    })
    expect(secondRes.status()).toBe(200)
    const second = await secondRes.json() as { siteId: string; organizationId: string; subdomain: string }

    expect(first.siteId).toEqual(expect.any(String))
    expect(second.siteId).toEqual(expect.any(String))
    expect(second.siteId).not.toBe(first.siteId)
    expect(second.organizationId).not.toBe(first.organizationId)
    expect(second.subdomain).toBe(`multi-site-two-${suffix}`)
  })
})
