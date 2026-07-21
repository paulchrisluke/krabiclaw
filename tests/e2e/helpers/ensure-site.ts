import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

export async function ensureSite(request: APIRequestContext, baseURL: string, siteId: string | null) {
  if (siteId) return siteId

  const suffix = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const createRes = await request.post(`${baseURL}/api/sites`, {
    data: {
      name: `E2E Org ${suffix}`,
      subdomain: `e2e-org-${suffix}-${rand}`,
      vertical: 'restaurant',
    },
  })
  expect(createRes.status()).toBe(200)
  const body = await createRes.json() as { siteId?: string }
  expect(body.siteId).toEqual(expect.any(String))

  // seedNewSite() defaults the new site's primary location's title to the
  // site's own name — correct for a real single-location business, but it
  // makes org/site/location indistinguishable at a glance while poking around
  // this fixture in a dev session. Give the location its own distinct title.
  const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
  if (contextRes.ok()) {
    const context = await contextRes.json() as { selectedLocation?: { id?: string } }
    const locationId = context.selectedLocation?.id
    if (locationId) {
      await request.patch(`${baseURL}/api/dashboard/locations/${locationId}`, {
        data: { title: `E2E Location ${suffix}` },
      })
    }
  }

  return body.siteId!
}