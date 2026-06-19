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
  const body = await createRes.json() as { siteId?: string }
  expect(body.siteId).toEqual(expect.any(String))
  return body.siteId!
}