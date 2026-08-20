import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  potteryHouseBaseURL, potteryHouseExtraHeaders, setupTenantHeaders,
} from './helpers'
import { devLoginHeaders, kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders, testBaseUrl } from './test-env'

type NotificationRow = { channel: string; template: string; status: string; recipient: string | null }
const executionHost = new URL(testBaseUrl()).hostname
const writableEnvironment = ['localhost', '127.0.0.1', 'preview.krabiclaw.com'].includes(executionHost)

function notificationUrl(baseURL: string, siteId: string, since: string) {
  const url = new URL(`${baseURL}/api/dev/notifications`)
  url.searchParams.set('site_id', siteId)
  url.searchParams.set('since', since)
  return url.toString()
}

async function waitForNotifications(
  request: APIRequestContext,
  baseURL: string,
  siteId: string,
  since: string,
  complete: (_rows: NotificationRow[]) => boolean,
) {
  let rows: NotificationRow[] = []
  await expect.poll(async () => {
    const response = await request.get(notificationUrl(baseURL, siteId, since), { headers: devLoginHeaders() })
    rows = response.ok() ? ((await response.json()) as { notifications: NotificationRow[] }).notifications : []
    return complete(rows)
  }, { timeout: 8_000 }).toBe(true)
  return rows
}

function expectOwnerDispatch(rows: NotificationRow[], guestEmail: string) {
  expect(rows.some(row => row.channel === 'dashboard' && row.status === 'sent')).toBe(true)
  expect(rows.some(row => row.channel === 'whatsapp' && row.status === 'sent')).toBe(true)
  expect(rows.some(row => row.channel !== 'dashboard' && row.recipient !== guestEmail && row.status === 'sent')).toBe(true)
}

async function chooseFirstAvailableTime(page: Page) {
  const slot = page.getByRole('button').filter({ hasText: 'Available' }).first()
  await expect(slot).toBeVisible()
  await slot.click()
  await page.getByRole('button', { name: /continue/i }).click()
}

async function dismissCookieConsent(page: Page) {
  const reject = page.locator('[data-consent-action="rejected"]')
  if (await reject.isVisible()) await reject.click()
}

test.describe('tenant guest journeys (disposable local/preview data only)', () => {
  test.skip(!writableEnvironment, 'guest writes are forbidden outside local and preview')

  test('Pottery House experience booking persists and creates log-only owner dispatch', async ({ page, request }) => {
    const since = new Date().toISOString()
    const email = `pottery-booking-${Date.now()}@playwright.example`
    await setupTenantHeaders(page, potteryHouseBaseURL, potteryHouseExtraHeaders)
    await page.goto(`${potteryHouseBaseURL}/experiences/pottery-wheel-class`, { waitUntil: 'load' })
    await dismissCookieConsent(page)
    await page.locator('[data-experience-cta="desktop"]').getByRole('button', { name: /book a class/i }).click()
    await chooseFirstAvailableTime(page)
    await page.getByLabel('Full name').fill('Pottery Journey Test')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel(/Phone number/i).fill('+66812345678')
    const submission = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/experiences/pottery-wheel-class/book'))
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    const response = await submission
    expect(response.status()).toBe(201)
    expect((await response.json() as { booking_id?: string }).booking_id).toEqual(expect.any(String))
    await expect(page).toHaveURL(/\/experiences\/confirmed/)
    await expect(page.locator('main')).toContainText(/booking|received|confirmed/i)
    const rows = await waitForNotifications(request, potteryHouseBaseURL, 'site-pottery-house', since, rows =>
      rows.some(row => row.template === 'experience_booking_customer_received' && row.recipient === email)
      && rows.some(row => row.channel === 'whatsapp' && row.template === 'new_reservation' && row.status === 'sent'),
    )
    expectOwnerDispatch(rows, email)
    expect(rows.some(row => row.template === 'experience_booking_customer_received' && row.recipient === email)).toBe(true)
  })

  test('Kikuzuki restaurant reservation persists and creates log-only owner dispatch', async ({ page, request }) => {
    const baseURL = kikuzukiTestBaseUrl()
    const since = new Date().toISOString()
    const email = `kikuzuki-reservation-${Date.now()}@playwright.example`
    await setupTenantHeaders(page, baseURL, kikuzukiTestExtraHeaders())
    await page.goto(`${baseURL}/reservations`, { waitUntil: 'load' })
    await dismissCookieConsent(page)
    await page.locator('label[for="reservation-booking-toggle"]').first().click()
    await chooseFirstAvailableTime(page)
    await page.getByLabel('Full name').fill('Kikuzuki Journey Test')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel(/Phone number/i).fill('+66812345679')
    const submission = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/public/sites/site-kikuzuki/reservations'))
    await page.getByLabel('Your details').getByRole('button', { name: /request reservation|ขอจอง/i }).click()
    const response = await submission
    expect(response.status()).toBe(201)
    expect((await response.json() as { id?: string }).id).toEqual(expect.any(String))
    await expect(page).toHaveURL(/\/reservations\/confirmed/)
    const rows = await waitForNotifications(request, baseURL, 'site-kikuzuki', since, rows =>
      rows.some(row => row.template === 'reservation_customer_received' && row.recipient === email)
      && rows.some(row => row.channel === 'whatsapp' && row.template === 'new_reservation' && row.status === 'sent'),
    )
    expectOwnerDispatch(rows, email)
    expect(rows.some(row => row.template === 'reservation_customer_received' && row.recipient === email)).toBe(true)
  })

  test('Pottery House contact persists and creates an owner notification', async ({ page, request }) => {
    const since = new Date().toISOString()
    const email = `pottery-contact-${Date.now()}@playwright.example`
    await setupTenantHeaders(page, potteryHouseBaseURL, potteryHouseExtraHeaders)
    await page.goto(`${potteryHouseBaseURL}/contact`, { waitUntil: 'load' })
    await dismissCookieConsent(page)
    await page.getByLabel(/your name/i).fill('Pottery Contact Journey')
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/your message/i).fill('Please tell me more about private pottery classes.')
    const submission = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/public/sites/site-pottery-house/contact'))
    await page.getByRole('button', { name: /send a message/i }).click()
    expect((await submission).status()).toBe(201)
    await expect(page).toHaveURL(/\/contact\/confirmed/)
    const rows = await waitForNotifications(request, potteryHouseBaseURL, 'site-pottery-house', since, rows =>
      rows.some(row => row.template === 'contact_customer_received' && row.recipient === email)
      && rows.some(row => row.channel === 'whatsapp' && row.template === 'new_contact_msg' && row.status === 'sent'),
    )
    expect(rows.some(row => row.channel === 'dashboard' && row.template === 'new_contact_msg' && row.status === 'sent')).toBe(true)
    expect(rows.some(row => row.channel === 'email' && row.template === 'contact_customer_received' && row.recipient === email)).toBe(true)
  })

  test('guest validation rejects invalid input and re-used cancellation tokens', async ({ request }) => {
    test.skip(executionHost === 'preview.krabiclaw.com', 'destructive token validation runs only against local disposable D1')
    const baseURL = testBaseUrl()
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const headers = { ...devLoginHeaders(), 'x-preview-tenant': 'pottery-house' }
    const book = (name: string, email: string, date: string, time: string) => request.post(`${baseURL}/api/public/sites/site-pottery-house/experiences/pottery-wheel-class/book`, {
      headers, data: { guest_name: name, guest_email: email, party_size: 1, booking_date: date, time_slot: time },
    })
    expect((await book('Invalid Date', 'past@playwright.example', yesterday, '10:00')).status()).toBe(400)
    expect((await book('Invalid Slot', 'slot@playwright.example', future, '03:17')).status()).toBe(400)
    expect((await request.post(`${baseURL}/api/public/sites/site-pottery-house/contact`, { headers, data: {} })).status()).toBe(400)
    expect((await request.post(`${baseURL}/api/public/sites/site-pottery-house/reservations`, { headers, data: {} })).status()).toBe(400)
    const created = await book('Cancel Once', 'cancel-once@playwright.example', future, '10:00')
    expect(created.status()).toBe(201)
    const body = await created.json() as { booking_id: string; cancellation_token: string }
    expect(JSON.stringify(body)).not.toContain('cancel-once@playwright.example')
    const cancelURL = `${baseURL}/api/public/sites/site-pottery-house/experiences/bookings/${body.booking_id}/cancel`
    const authHeaders = { ...headers, Authorization: `Bearer ${body.cancellation_token}` }
    expect((await request.post(cancelURL, { headers: authHeaders })).status()).toBe(200)
    expect((await request.post(cancelURL, { headers: authHeaders })).status()).not.toBe(200)
  })
})
