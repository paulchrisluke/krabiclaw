import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from '../test-env'

export async function loginAs(request: APIRequestContext, baseURL: string, userId?: string) {
  const res = await request.get(devLoginUrl(baseURL, userId), {
    headers: devLoginHeaders(),
    maxRedirects: 0,
  })
  expect(res.status()).toBe(302)
}
