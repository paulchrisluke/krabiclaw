import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  openTenantPage, potteryHouseBaseURL, potteryHouseExtraHeaders,
} from './helpers'
import { devLoginHeaders, kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders, testBaseUrl } from './test-env'
import { loginAs } from './helpers/auth'

type NotificationRow = { template: string }
type DeliveryRow = { channel: 'email' | 'whatsapp'; purpose: string; status: string }
type NotificationState = { notifications: NotificationRow[]; deliveries: DeliveryRow[] }
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
  complete: (_state: NotificationState) => boolean,
) {
  let state: NotificationState = { notifications: [], deliveries: [] }
  await expect.poll(async () => {
    const response = await request.get(notificationUrl(baseURL, siteId, since), { headers: devLoginHeaders() })
    state = response.ok() ? await response.json() as NotificationState : { notifications: [], deliveries: [] }
    return complete(state)
  }, { timeout: 8_000 }).toBe(true)
  return state
}

function expectOwnerDispatch(state: NotificationState) {
  expect(state.notifications.length).toBeGreaterThan(0)
  expect(state.deliveries.some(row => row.purpose === 'owner_alert' && row.status === 'sent')).toBe(true)
  expect(state.deliveries.some(row => row.purpose === 'guest_acknowledgement' && row.channel === 'email' && row.status === 'sent')).toBe(true)
}

async function chooseFirstAvailableTime(page: Page) {
  const slot = page.getByRole('button', { name: /\bAvailable$/ }).first()
  await expect(slot).toBeVisible()
  await slot.click()
  await page.getByRole('button', { name: /continue/i }).click()
}

test.describe('tenant guest journeys (disposable local/preview data only)', () => {
  test.skip(!writableEnvironment, 'guest writes are forbidden outside local and preview')

  test('Pottery House Product booking persists and creates log-only owner dispatch', async ({ page, request }) => {
    test.setTimeout(90_000)
    const since = new Date().toISOString()
    const email = `pottery-booking-${Date.now()}@playwright.example`
    // A guest books an occurrence, and occurrences are materialized from the
    // product's rules. Generation is idempotent, so the journey makes sure
    // there is something on the calendar to book before it tries.
    await loginAs(request, testBaseUrl(), 'user-e2e-pottery-owner')
    const generated = await request.post(`${testBaseUrl()}/api/editor/sites/site-pottery-house/products/exp-ph-wheel/sessions/generate`, {
      headers: { 'x-preview-tenant': 'pottery-house' },
      data: { through: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) },
    })
    expect(generated.status(), await generated.text()).toBe(200)
    await openTenantPage(page, `${potteryHouseBaseURL}/locations/krabi/products/pottery-wheel-class`, potteryHouseExtraHeaders)
    // What a guest presses is the labelled control; the checkbox behind it is
    // screen-reader-only and has no clickable box of its own.
    await page.getByRole('button', { name: 'Book now' }).first().click()
    await chooseFirstAvailableTime(page)
    await page.getByLabel('Full name').fill('Pottery Journey Test')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel(/Phone number/i).fill('+66812345678')
    const submission = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/products/pottery-wheel-class/book'))
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    const response = await submission
    expect(response.status()).toBe(201)
    expect((await response.json() as { booking_id?: string }).booking_id).toEqual(expect.any(String))
    await expect(page).toHaveURL(/\/bookings\/confirmed/)
    await expect(page.locator('main')).toContainText(/booking|received|confirmed/i)
    const state = await waitForNotifications(request, potteryHouseBaseURL, 'site-pottery-house', since, state =>
      state.notifications.some(row => row.template === 'new_reservation')
      && state.deliveries.some(row => row.purpose === 'owner_alert' && row.channel === 'whatsapp' && row.status === 'sent')
      && state.deliveries.some(row => row.purpose === 'guest_acknowledgement' && row.channel === 'email' && row.status === 'sent'),
    )
    expectOwnerDispatch(state)
  })

  test('Kikuzuki restaurant reservation persists and creates log-only owner dispatch', async ({ page, request }) => {
    test.setTimeout(90_000)
    const baseURL = kikuzukiTestBaseUrl()
    const since = new Date().toISOString()
    const email = `kikuzuki-reservation-${Date.now()}@playwright.example`
    await openTenantPage(page, `${baseURL}/reservations`, kikuzukiTestExtraHeaders())
    await page.locator('label[for="reservation-booking-toggle"]').first().click()
    await chooseFirstAvailableTime(page)
    await page.getByLabel('Full name').fill('Kikuzuki Journey Test')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel(/Phone number/i).fill('+66812345679')
    const submission = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/public/sites/site-kikuzuki/reservations'))
    await page.getByLabel('Your details').getByRole('button', { name: /request reservation|ขอจองโต๊ะ/i }).click()
    const response = await submission
    expect(response.status()).toBe(201)
    const reservation: { id?: unknown; cancellationToken?: unknown; message?: unknown } = await response.json()
    expect(reservation.message).toBe('Your reservation is confirmed.')
    expect(reservation.id).toEqual(expect.any(String))
    expect(reservation.cancellationToken).toEqual(expect.any(String))
    if (typeof reservation.id !== 'string' || typeof reservation.cancellationToken !== 'string') {
      throw new Error('Reservation response omitted its lookup credentials')
    }
    // A booking and a reservation are read back through one route: what holds
    // the seats differs, what the guest is shown does not.
    const persisted = await request.get(`${baseURL}/api/public/sites/site-kikuzuki/booking-requests/${reservation.id}`, {
      headers: { ...kikuzukiTestExtraHeaders(), Authorization: `Bearer ${reservation.cancellationToken}` },
    })
    expect(persisted.status(), await persisted.text()).toBe(200)
    const persistedBody: { booking?: { kind?: unknown; status?: unknown } } = await persisted.json()
    expect(persistedBody.booking?.kind).toBe('reservation')
    expect(persistedBody.booking?.status).toBe('confirmed')
    await expect(page).toHaveURL(/\/reservations\/confirmed/)
    await expect(page.locator('main')).toContainText('Reservation confirmed')
    await expect(page.locator('main')).not.toContainText(/confirm your .* shortly/i)
    const state = await waitForNotifications(request, baseURL, 'site-kikuzuki', since, state =>
      state.notifications.some(row => row.template === 'new_reservation')
      && state.deliveries.some(row => row.purpose === 'owner_alert' && row.channel === 'whatsapp' && row.status === 'sent')
      && state.deliveries.some(row => row.purpose === 'guest_acknowledgement' && row.channel === 'email' && row.status === 'sent'),
    )
    expectOwnerDispatch(state)
  })

  test('Pottery House contact persists and creates an owner notification', async ({ page, request }) => {
    test.setTimeout(90_000)
    const since = new Date().toISOString()
    const email = `pottery-contact-${Date.now()}@playwright.example`
    await openTenantPage(page, `${potteryHouseBaseURL}/contact`, potteryHouseExtraHeaders)
    await expect(page.locator('[data-hydrated]')).toHaveAttribute('data-hydrated', 'true')
    await page.getByLabel(/your name/i).fill('Pottery Contact Journey')
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/your message/i).fill('Please tell me more about private pottery classes.')
    const submission = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/public/sites/site-pottery-house/contact'))
    await page.getByRole('button', { name: /send a message/i }).click()
    expect((await submission).status()).toBe(201)
    await expect(page).toHaveURL(/\/contact\/confirmed/)
    const state = await waitForNotifications(request, potteryHouseBaseURL, 'site-pottery-house', since, state =>
      state.notifications.some(row => row.template === 'new_contact_msg')
      && state.deliveries.some(row => row.purpose === 'owner_alert' && row.channel === 'whatsapp' && row.status === 'sent')
      && state.deliveries.some(row => row.purpose === 'guest_acknowledgement' && row.channel === 'email' && row.status === 'sent'),
    )
    expectOwnerDispatch(state)
  })

  test('guest validation rejects invalid input and re-used cancellation tokens', async ({ request }) => {
    test.skip(executionHost === 'preview.krabiclaw.com', 'destructive token validation runs only against local disposable D1')
    const baseURL = testBaseUrl()
    const headers = { ...devLoginHeaders(), 'x-preview-tenant': 'pottery-house' }
    // A guest names a SESSION, not a date and a time: the occurrence is a real
    // row, so there is nothing to re-derive and no slot to invent.
    const book = (name: string, email: string, sessionId: string) => request.post(`${baseURL}/api/public/sites/site-pottery-house/products/pottery-wheel-class/book`, {
      headers, data: { guest_name: name, guest_email: email, party_size: 1, session_id: sessionId },
    })
    expect((await book('Missing Session', 'past@playwright.example', '')).status()).toBe(400)
    expect((await book('Unknown Session', 'slot@playwright.example', 'session-that-does-not-exist')).status()).toBe(404)
    expect((await request.post(`${baseURL}/api/public/sites/site-pottery-house/contact`, { headers, data: {} })).status()).toBe(400)
    expect((await request.post(`${baseURL}/api/public/sites/site-pottery-house/reservations`, { headers, data: {} })).status()).toBe(400)
    const sessions = await request.get(`${baseURL}/api/public/sites/site-pottery-house/products/pottery-wheel-class/sessions`, { headers })
    expect(sessions.status()).toBe(200)
    const { sessions: rows } = await sessions.json() as { sessions: Array<{ id: string; is_full: boolean }> }
    const openSession = rows.find(session => !session.is_full)
    expect(openSession, 'pottery-wheel-class has no open session materialized').toBeTruthy()
    const created = await book('Cancel Once', 'cancel-once@playwright.example', openSession!.id)
    expect(created.status()).toBe(201)
    const body = await created.json() as { booking_id: string; cancellation_token: string }
    expect(JSON.stringify(body)).not.toContain('cancel-once@playwright.example')
    const cancelURL = `${baseURL}/api/public/sites/site-pottery-house/booking-requests/${body.booking_id}/cancel`
    const authHeaders = { ...headers, Authorization: `Bearer ${body.cancellation_token}` }
    expect((await request.post(cancelURL, { headers: authHeaders })).status()).toBe(200)
    expect((await request.post(cancelURL, { headers: authHeaders })).status()).not.toBe(200)
  })
})
