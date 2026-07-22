import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { dashboardOrgHeaders } from '../test-env'

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

  // Every /api/dashboard/* route resolves its organization strictly from the
  // x-dashboard-org-slug header (server/utils/dashboard-context.ts —
  // activeOrganizationId is intentionally only consulted by callers that pass
  // requireOrganization: false, which the locations PATCH below does not).
  // POST /api/sites only returns organizationId, not the org's slug, so look
  // it up via the same discovery endpoint the rest of this test suite already
  // uses for that purpose.
  const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
  expect(contextRes.ok()).toBe(true)
  const context = await contextRes.json() as { organization?: { slug?: string } }
  const orgSlug = context.organization?.slug
  expect(orgSlug).toEqual(expect.any(String))
  const orgHeaders = dashboardOrgHeaders(orgSlug!)

  // seedNewSite() defaults the new site's primary location's title to the
  // site's own name — correct for a real single-location business, but it
  // makes org/site/location indistinguishable at a glance while poking around
  // this fixture in a dev session. Give the location its own distinct title.
  //
  // Fetch locations scoped to the newly created site so we don't accidentally
  // patch a location that belongs to a different site (e.g. the one that
  // happens to be selected in the dashboard context).
  const locRes = await request.get(`${baseURL}/api/sites/${body.siteId}/locations`)
  expect(locRes.ok()).toBe(true)
  const locBody = await locRes.json() as { locations?: { id?: string }[] }
  const locationId = locBody.locations?.[0]?.id
  expect(locationId).toEqual(expect.any(String))
  const patchRes = await request.patch(`${baseURL}/api/dashboard/locations/${locationId}`, {
    headers: orgHeaders,
    data: { title: `E2E Location ${suffix}` },
  })
  expect(patchRes.ok()).toBe(true)

  return body.siteId!
}