import { expect, request as playwrightRequest, test } from '@playwright/test'

import { loginAs } from './helpers/auth'
import { createScratchLocation, mcpData, mcpRequest } from './helpers/mcp'
import {
  kikuzukiTestBaseUrl,
  kikuzukiTestExtraHeaders,
  potteryHouseTestBaseUrl,
  potteryHouseTestExtraHeaders,
} from './test-env'

const KIKUZUKI_OWNER_ID = 'user-e2e-kikuzuki-owner'
const KIKUZUKI_SITE_ID = 'site-kikuzuki'
const KIKUZUKI_LOCATION_ID = 'loc-kikuzuki'

test('Service Point QR credentials preserve Better Auth continuity and reject stale, cross-tenant, or cross-location use', async ({ browser, request, baseURL }) => {
  test.setTimeout(120_000)
  await loginAs(request, baseURL!, KIKUZUKI_OWNER_ID)
  const siteId = KIKUZUKI_SITE_ID
  const locationId = KIKUZUKI_LOCATION_ID
  const otherLocationId = await createScratchLocation(request, baseURL!, siteId)
  const label = `Patio North ${Date.now()}`

  const createResponse = await mcpRequest(request, baseURL!, {
    method: 'tools/call',
    toolName: 'create_service_point',
    args: { site_id: siteId, location_id: locationId, label },
  })
  expect(createResponse.status(), await createResponse.text()).toBe(200)
  const servicePoint = mcpData<{ service_point: { id: string } }>(await createResponse.json()).service_point

  const listResponse = await request.get(`${baseURL}/api/sites/${siteId}/locations/${locationId}/service-points`)
  expect(listResponse.status(), await listResponse.text()).toBe(200)
  await expect(listResponse.json()).resolves.toMatchObject({
    service_points: expect.arrayContaining([expect.objectContaining({ id: servicePoint.id, label, status: 'active', qr_credential: null })]),
  })

  const crossLocation = await request.patch(`${baseURL}/api/sites/${siteId}/locations/${otherLocationId}/service-points/${servicePoint.id}`, {
    data: { label: 'Wrong location' },
  })
  expect(crossLocation.status()).toBe(404)

  const provisionResponse = await request.post(`${baseURL}/api/sites/${siteId}/locations/${locationId}/service-points/${servicePoint.id}/credential`, {
    data: { mode: 'provision' },
  })
  expect(provisionResponse.status(), await provisionResponse.text()).toBe(201)
  const provisioned = await provisionResponse.json() as { ordering_qr: { ordering_url: string; credential: string } }
  expect(provisioned.ordering_qr.credential).toMatch(/^oqr_[A-Za-z0-9_-]{43}$/)
  const provisionedUrl = new URL(provisioned.ordering_qr.ordering_url)
  expect(provisionedUrl.pathname).toBe('/ordering')
  expect(provisionedUrl.hash).toBe(`#credential=${provisioned.ordering_qr.credential}`)

  const wrongTenantBaseUrl = potteryHouseTestBaseUrl()
  const wrongTenant = await playwrightRequest.newContext({
    baseURL: wrongTenantBaseUrl,
    extraHTTPHeaders: potteryHouseTestExtraHeaders(),
  })
  const wrongTenantSignIn = await wrongTenant.post('/api/auth/sign-in/anonymous', {
    headers: { origin: new URL(wrongTenantBaseUrl).origin },
    data: {},
  })
  expect(wrongTenantSignIn.status(), await wrongTenantSignIn.text()).toBe(200)
  const wrongTenantResolution = await wrongTenant.post('/api/public/ordering/resolve', {
    data: { credential: provisioned.ordering_qr.credential },
  })
  expect(wrongTenantResolution.status()).toBe(404)
  const wrongTenantBody = await wrongTenantResolution.text()
  expect(wrongTenantBody).toBe('{"error":"Ordering QR code is unavailable"}')
  expect(wrongTenantBody).not.toContain(label)
  expect(wrongTenantBody).not.toContain('Kikuzuki')
  await wrongTenant.dispose()

  const tenantBaseUrl = kikuzukiTestBaseUrl()
  const orderingUrl = (credential: string) => `${tenantBaseUrl}/ordering#credential=${credential}`
  const anonymousContext = await browser.newContext({ extraHTTPHeaders: kikuzukiTestExtraHeaders() })
  const page = await anonymousContext.newPage()
  const openOrderingQr = async (credential: string) => {
    await page.goto('about:blank')
    await page.goto(orderingUrl(credential))
  }
  await openOrderingQr(provisioned.ordering_qr.credential)
  await expect(page.getByRole('heading', { name: label })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue to ordering menu' })).toBeVisible()
  const firstSession = await page.evaluate(async () => await fetch('/api/auth/get-session').then(response => response.json())) as { user: { id: string } }
  const firstUserId = firstSession.user.id

  let releaseOrderingResolution: (() => void) | undefined
  const orderingResolutionBlocked = new Promise<void>((resolve) => { releaseOrderingResolution = resolve })
  await page.route('**/api/public/ordering/resolve', async (route) => {
    await orderingResolutionBlocked
    await route.continue()
  }, { times: 1 })
  const continueLink = page.getByRole('link', { name: 'Continue to ordering menu' })
  const continueUrl = new URL(await continueLink.getAttribute('href') ?? '')
  expect(continueUrl.origin).toBe('https://www.kikuzuki-thailand.com')
  await continueLink.evaluate((link, localOrigin) => {
    const destination = new URL((link as HTMLAnchorElement).href)
    ;(link as HTMLAnchorElement).href = `${localOrigin}${destination.pathname}${destination.search}${destination.hash}`
  }, new URL(tenantBaseUrl).origin)
  await continueLink.click()
  await expect(page).toHaveURL(/\/order\?location=[^&]+&service_point=1$/)
  await expect(page.getByRole('region', { name: 'Ordering context' })).toContainText('Confirming your service point')
  await expect(page.getByRole('region', { name: 'Ordering menu' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /add/i })).toHaveCount(0)
  releaseOrderingResolution?.()
  await expect(page.getByRole('region', { name: 'Ordering context' })).toContainText(label)
  await expect(page.getByRole('region', { name: 'Ordering context' })).toContainText('Kikuzuki')
  await expect(page.getByRole('region', { name: 'Ordering menu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tuna Sushi' })).toBeVisible()
  const continuedSession = await page.evaluate(async () => await fetch('/api/auth/get-session').then(response => response.json())) as { user: { id: string } }
  expect(continuedSession.user.id).toBe(firstUserId)

  const rotateResponse = await request.post(`${baseURL}/api/sites/${siteId}/locations/${locationId}/service-points/${servicePoint.id}/credential`, {
    data: { mode: 'rotate' },
  })
  expect(rotateResponse.status(), await rotateResponse.text()).toBe(201)
  const rotated = await rotateResponse.json() as { ordering_qr: { ordering_url: string; credential: string; version: number } }
  expect(rotated.ordering_qr.credential).not.toBe(provisioned.ordering_qr.credential)
  expect(rotated.ordering_qr.version).toBe(2)

  await openOrderingQr(provisioned.ordering_qr.credential)
  await expect(page.getByText('This Ordering QR code is unavailable')).toBeVisible()
  await openOrderingQr(rotated.ordering_qr.credential)
  await expect(page.getByRole('heading', { name: label })).toBeVisible()

  const pauseResponse = await request.patch(`${baseURL}/api/sites/${siteId}/locations/${locationId}/service-points/${servicePoint.id}`, {
    data: { status: 'paused' },
  })
  expect(pauseResponse.status(), await pauseResponse.text()).toBe(200)
  await openOrderingQr(rotated.ordering_qr.credential)
  await expect(page.getByText('This Ordering QR code is unavailable')).toBeVisible()

  const resumeResponse = await request.patch(`${baseURL}/api/sites/${siteId}/locations/${locationId}/service-points/${servicePoint.id}`, {
    data: { status: 'active' },
  })
  expect(resumeResponse.status(), await resumeResponse.text()).toBe(200)
  const revokeResponse = await request.delete(`${baseURL}/api/sites/${siteId}/locations/${locationId}/service-points/${servicePoint.id}/credential`)
  expect(revokeResponse.status(), await revokeResponse.text()).toBe(200)
  await openOrderingQr(rotated.ordering_qr.credential)
  await expect(page.getByText('This Ordering QR code is unavailable')).toBeVisible()

  await anonymousContext.close()
})

test('Ordering QR resolution requires Better Auth and rate-limits credential guessing', async () => {
  test.setTimeout(120_000)
  const tenantBaseUrl = kikuzukiTestBaseUrl()
  const anonymous = await playwrightRequest.newContext({
    baseURL: tenantBaseUrl,
    extraHTTPHeaders: kikuzukiTestExtraHeaders(),
  })
  const testNonce = Date.now().toString(36)
  const credential = `oqr_${testNonce.padEnd(43, 'A')}`
  const sourceIp = `198.51.100.${(Date.now() % 250) + 1}`
  const unauthenticatedManagement = await anonymous.get('/api/sites/unavailable/locations/unavailable/service-points')
  expect(unauthenticatedManagement.status()).toBe(401)
  const unauthenticated = await anonymous.post('/api/public/ordering/resolve', { data: { credential } })
  expect(unauthenticated.status()).toBe(401)

  const signIn = await anonymous.post('/api/auth/sign-in/anonymous', {
    headers: { origin: new URL(tenantBaseUrl).origin },
    data: {},
  })
  expect(signIn.status(), await signIn.text()).toBe(200)

  for (let attempt = 0; attempt < 61; attempt += 1) {
    const response = await anonymous.post('/api/public/ordering/resolve', {
      headers: { 'CF-Connecting-IP': sourceIp },
      data: { credential },
    })
    expect(response.status()).toBe(attempt < 60 ? 404 : 429)
  }
  await anonymous.dispose()
})

test('Better Auth Anonymous accepts only a registered active custom tenant origin', async ({ baseURL }) => {
  const customDomain = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: 'https://www.kikuzuki-thailand.com', cookie: 'origin-check=1' },
  })
  const accepted = await customDomain.post('/api/auth/sign-in/anonymous', { data: {} })
  expect(accepted.status(), await accepted.text()).toBe(200)
  await customDomain.dispose()

  const unknownDomain = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: 'https://unregistered-tenant.example', cookie: 'origin-check=1' },
  })
  const rejected = await unknownDomain.post('/api/auth/sign-in/anonymous', { data: {} })
  expect(rejected.status()).toBe(403)
  await unknownDomain.dispose()
})
