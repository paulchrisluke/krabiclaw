import { expect, test } from '@playwright/test'
import { devLoginHeaders, potteryHouseTestBaseUrl } from './test-env'

test('lane-local dev routes and tenant aliases resolve against the lane resources', async ({ request, baseURL }) => {
  const platformUrl = new URL(baseURL!)
  const lane = platformUrl.hostname.split('.')[0]
  expect(lane).toMatch(/^e2e-[1-4]$/)

  const billingState = await request.get(
    `${baseURL}/api/dev/billing-state?organization_id=org-pottery-house`,
    { headers: devLoginHeaders() },
  )
  expect(billingState.status()).toBe(200)
  const billingBody = await billingState.json() as { site_plans?: Array<{ site_id?: string }> }
  expect(billingBody.site_plans?.some(site => site.site_id === 'site-pottery-house')).toBe(true)

  const tenantUrl = new URL(potteryHouseTestBaseUrl())
  expect(tenantUrl.hostname).toBe(`pottery-house-${lane}.krabiclaw.com`)
  const tenantResponse = await request.get(tenantUrl.toString())
  expect(tenantResponse.status()).toBeLessThan(400)
})
