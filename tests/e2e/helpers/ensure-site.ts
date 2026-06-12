import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

export async function ensureSite(request: APIRequestContext, baseURL: string, siteId: string | null) {
  if (siteId) return siteId

  const suffix = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const createRes = await request.post(`${baseURL}/api/sites`, {
    data: {
      name: `E2E Site ${suffix}`,
      subdomain: `e2e-site-${suffix}-${rand}`,
      vertical: 'restaurant',
    },
  })
  expect(createRes.status()).toBe(200)

  const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
  expect(contextRes.status()).toBe(200)
  const context = await contextRes.json() as {
    restaurant?: { id?: string | null }
  }
  const createdSiteId = context.restaurant?.id ?? null
  expect(createdSiteId).toEqual(expect.any(String))
  return createdSiteId
}