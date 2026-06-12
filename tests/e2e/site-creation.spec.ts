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
      error: 'vertical is required and must be one of: restaurant, experience, retail, wellness, service',
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
      error: 'vertical is required and must be one of: restaurant, experience, retail, wellness, service',
    })
  })
})
