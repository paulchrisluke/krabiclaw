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
  //
  // Fetch locations scoped to the newly created site so we don't accidentally
  // patch a location that belongs to a different site (e.g. the one that
  // happens to be selected in the dashboard context).
  const locRes = await request.get(`${baseURL}/api/sites/${body.siteId}/locations`)
  if (locRes.ok()) {
    const locBody = await locRes.json() as { locations?: { id?: string }[] }
    const locationId = locBody.locations?.[0]?.id
    if (locationId) {
      const patchRes = await request.patch(`${baseURL}/api/dashboard/locations/${locationId}`, {
        data: { title: `E2E Location ${suffix}` },
      })
      expect(patchRes.ok()).toBe(true)
    }
  }

  return body.siteId!
}