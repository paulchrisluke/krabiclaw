import { expect, request as playwrightRequest, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { blawbyTestExtraHeaders } from './test-env'

test.use({ timezoneId: 'America/New_York' })

test('native online review uses canonical Products, holds capacity, and releases it once', async ({ page, request, baseURL }) => {
  test.skip(process.env.NATIVE_CONSULTATION_PROOF !== 'true' || !['localhost', '127.0.0.1'].includes(new URL(baseURL!).hostname), 'Explicit opt-in in an isolated disposable checkout only; never mutate shared suite fixtures')
  test.setTimeout(120_000)
  const analyticsFailures: string[] = []
  page.on('response', response => {
    if (/\/api\/(analytics\/track|public\/conversion-events)$/.test(new URL(response.url()).pathname) && response.status() >= 400) analyticsFailures.push(`${response.status()} ${response.url()}`)
  })
  await loginAs(page.request, baseURL!, 'user-e2e-ncls-owner')
  const cleanupRequest = await playwrightRequest.newContext({ baseURL, storageState: await page.context().storageState() })
  const org = 'org-ncls-blawby'
  const editor = `/api/editor/organizations/${org}`
  const previous = await (await page.request.get(`${editor}/consultation`)).json()
  const stamp = Date.now()
  const products: Array<{ id: string; name: string; slug: string; variants: Array<{ id: string }> }> = []
  const tomorrow = new Date(Date.now() + 86400000)
  const day = tomorrow.toISOString().slice(0, 10)
  const headers = blawbyTestExtraHeaders()
  try {
  for (let index = 0; index < 2; index++) {
    const create = await page.request.post(`${editor}/products`, { data: { name: `Local consultation ${stamp}-${index}`, description: 'A local test service for reviewing the native consultation flow.', variants: [{ name: 'Online', prices: [{ unit_amount: 0, currency: 'USD' }] }] } })
    expect(create.status(), await create.text()).toBe(201)
    const product = (await create.json()).product
    products.push(product)
    const config = await page.request.put(`${editor}/products/${product.id}/booking`, { data: { duration_minutes: 45, default_capacity: 1, confirmation_mode: 'review', online_payment_required: true, online_timezone: 'UTC', calendar_group: `local-${stamp}` } })
    expect(config.status(), await config.text()).toBe(200)
    const schedule = await page.request.put(`${editor}/products/${product.id}/availability`, { data: { location_id: null, slots: [{ weekday: tomorrow.getUTCDay(), start_time: '14:00', capacity: 1 }] } })
    expect(schedule.status(), await schedule.text()).toBe(200)
    const publish = await page.request.put(`${editor}/products/${product.id}/publication`, { data: { published: true } })
    expect(publish.status(), await publish.text()).toBe(200)
  }
  const activate = await page.request.put(`${editor}/consultation`, { data: { mode: 'native' } })
  expect(activate.status(), await activate.text()).toBe(200)
    await page.goto(`/dashboard/north-carolina-legal-services/products/${products[0]!.id}/booking`)
    await expect(page.getByLabel('Online timezone', { exact: true })).toHaveValue('UTC')
    await page.screenshot({ path: 'artifacts/consultations-editor-desktop.png', fullPage: true })
    await page.setExtraHTTPHeaders(headers)
    await page.goto('/schedule')
    await expect(page.getByRole('heading', { name: products[0]!.name })).toBeVisible()
    await page.screenshot({ path: 'artifacts/consultations-desktop.png', fullPage: true })
    await page.getByRole('link', { name: products[0]!.name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/experiences/${products[0]!.slug}$`))
    await expect(page.getByRole('heading', { name: products[0]!.name, level: 1 })).toBeVisible()
    await expect(page.getByText('A local test service for reviewing the native consultation flow.', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /where.*meet/i })).toHaveCount(0)
    await page.screenshot({ path: 'artifacts/consultations-detail-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'artifacts/consultations-detail-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.getByRole('button', { name: 'Book now', exact: true }).filter({ visible: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: products[0]!.name })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Timezone', exact: true })).toHaveValue('America/New_York')
    await expect(page.getByRole('dialog').getByRole('button', { name: /10:00 AM/ }).first()).toBeVisible()
    await page.getByRole('combobox', { name: 'Timezone', exact: true }).selectOption('UTC')
    await expect(page.getByRole('dialog').getByRole('button', { name: /2:00 PM/ }).first()).toBeVisible()
    await page.goto('/schedule')
    await page.locator('article').filter({ has: page.getByRole('heading', { name: products[0]!.name }) }).getByRole('button', { name: 'Choose a time', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: products[0]!.name })).toBeVisible()
    await page.getByRole('combobox', { name: 'Timezone', exact: true }).selectOption('UTC')
    await expect(page.getByRole('dialog').getByText('Party size', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog').getByRole('button', { name: /more guests|fewer guests/i })).toHaveCount(0)
    await page.getByRole('dialog').getByRole('button', { name: /2:00 PM/ }).first().click()
    await page.screenshot({ path: 'artifacts/consultations-dialog-desktop.png', fullPage: false })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'artifacts/consultations-dialog-mobile.png', fullPage: false })
    const sessions = await Promise.all(products.map(async product => {
      const response = await request.get(`/api/public/products/${product.slug}/sessions?location_id=online&from=${day}&to=${day}`, { headers })
      expect(response.status(), await response.text()).toBe(200)
      return (await response.json()).sessions.find((session: { starts_at: string }) => session.starts_at.startsWith(day))
    }))
    const book = (index: number) => request.post(`/api/public/products/${products[index]!.slug}/book`, { headers, data: { session_id: sessions[index].id, variant_id: products[index]!.variants[0]!.id, party_size: 1, guest_name: `Local review ${index}`, guest_email: `consultation-${stamp}-${index}@playwright.example` } })
    const results = await Promise.all([book(0), book(1)])
    expect(results.map(result => result.status()).sort()).toEqual([201, 409])
    const pending = await results.find(result => result.status() === 201)!.json()
    expect(pending).toMatchObject({ status: 'pending', booking_id: pending.request_id })
    expect(pending.operational_booking_id).not.toBe(pending.request_id)
    const details = await page.request.get(`/api/dashboard/bookings/booking/${pending.request_id}?org=north-carolina-legal-services`)
    expect(details.status(), await details.text()).toBe(200)
    expect((await details.json()).booking).toMatchObject({ locationId: null, locationTitle: 'Online', status: 'pending', operationalBookingId: pending.operational_booking_id })
    const key = `reject-${stamp}`
    for (let replay = 0; replay < 2; replay++) {
      const reject = await page.request.post(`/api/dashboard/organizations/${org}/guest-threads/${pending.request_id}/operations/reject`, { data: { idempotencyKey: key } })
      expect(reject.status(), await reject.text()).toBe(200)
    }
    const remaining = await request.get(`/api/public/products/${products[0]!.slug}/sessions?location_id=online&from=${day}&to=${day}`, { headers })
    expect((await remaining.json()).sessions.find((session: { id: string }) => session.id === sessions[0].id)).toMatchObject({ remaining: 1, is_full: false })
    const dialog = page.getByRole('dialog', { name: products[0]!.name })
    await dialog.getByRole('button', { name: /2:00 PM/ }).first().click()
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    await dialog.getByLabel('Full name', { exact: true }).fill('Browser review guest')
    await dialog.getByLabel('Email address', { exact: true }).fill(`browser-consultation-${stamp}@playwright.example`)
    await page.screenshot({ path: 'artifacts/consultations-contact-mobile.png', fullPage: false })
    const submitted = page.waitForResponse(response => response.url().includes(`/products/${products[0]!.slug}/book`) && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Request appointment', exact: true }).click()
    const browserBookingResponse = await submitted
    expect(browserBookingResponse.status(), await browserBookingResponse.text()).toBe(201)
    const browserBooking = await browserBookingResponse.json()
    expect(browserBooking.status).toBe('pending')
    await expect(page).toHaveURL(/\/bookings\/confirmed/)
    await expect(page.getByRole('heading', { name: /Request received, Browser review guest/ })).toBeVisible()
    await page.screenshot({ path: 'artifacts/consultations-receipt-mobile.png', fullPage: false })
    expect(analyticsFailures).toEqual([])
    for (let replay = 0; replay < 2; replay++) {
      const confirm = await page.request.post(`/api/dashboard/organizations/${org}/guest-threads/${browserBooking.request_id}/operations/confirm`, { data: { idempotencyKey: `confirm-${stamp}` } })
      expect(confirm.status(), await confirm.text()).toBe(200)
    }
    const confirmedDetails = await page.request.get(`/api/dashboard/bookings/booking/${browserBooking.request_id}?org=north-carolina-legal-services`)
    expect((await confirmedDetails.json()).booking).toMatchObject({ status: 'confirmed', operationalBookingId: browserBooking.operational_booking_id })
    const browserCancel = await request.post(`/api/public/booking-requests/${browserBooking.request_id}/cancel`, { headers: { ...headers, authorization: `Bearer ${browserBooking.cancellation_token}` } })
    expect(browserCancel.status(), await browserCancel.text()).toBe(200)
    const cancelledBrowserDetails = await page.request.get(`/api/dashboard/bookings/booking/${browserBooking.request_id}?org=north-carolina-legal-services`)
    expect((await cancelledBrowserDetails.json()).booking.status).toBe('cancelled')
    const paid = await page.request.patch(`${editor}/products/${products[0]!.id}`, { data: { variants: [{ id: products[0]!.variants[0]!.id, name: 'Online', prices: [{ unit_amount: 7500, currency: 'USD' }] }] } })
    expect(paid.status(), await paid.text()).toBe(200)
    const blocked = await book(0)
    expect(blocked.status(), await blocked.text()).toBe(409)
    expect(await blocked.json()).toMatchObject({ code: 'payment_required' })
    const instantPolicy = await page.request.put(`${editor}/products/${products[0]!.id}/booking`, { data: { duration_minutes: 45, default_capacity: 1, confirmation_mode: 'instant', online_payment_required: false } })
    expect(instantPolicy.status(), await instantPolicy.text()).toBe(200)
    const instantResponse = await book(0)
    expect(instantResponse.status(), await instantResponse.text()).toBe(201)
    const instant = await instantResponse.json()
    expect(instant.status).toBe('confirmed')
    for (let replay = 0; replay < 2; replay++) {
      const cancel = await request.post(`/api/public/booking-requests/${instant.request_id}/cancel`, { headers: { ...headers, authorization: `Bearer ${instant.cancellation_token}` } })
      expect(cancel.status(), await cancel.text()).toBe(replay === 0 ? 200 : 404)
      const cancelledDetails = await page.request.get(`/api/dashboard/bookings/booking/${instant.request_id}?org=north-carolina-legal-services`)
      expect((await cancelledDetails.json()).booking.status).toBe('cancelled')
      const released = await request.get(`/api/public/products/${products[0]!.slug}/sessions?location_id=online`, { headers })
      expect((await released.json()).sessions.find((session: { id: string }) => session.id === sessions[0].id).remaining).toBe(1)
    }
  } finally {
    await cleanupRequest.put(`${editor}/consultation`, { data: { mode: previous.mode } })
    for (const product of products) {
      await cleanupRequest.put(`${editor}/products/${product.id}/publication`, { data: { published: false } })
      const deleted = await cleanupRequest.delete(`${editor}/products/${product.id}`)
      if (deleted.status() === 200) continue
      // Canonical Product deletion preserves booked history, even when cancelled.
      expect(deleted.status(), await deleted.text()).toBe(409)
      await cleanupRequest.put(`${editor}/products/${product.id}/booking`, { data: { duration_minutes: 45, default_capacity: 1, calendar_group: null } })
      await cleanupRequest.put(`${editor}/products/${product.id}/availability`, { data: { location_id: null, slots: [] } })
      await cleanupRequest.patch(`${editor}/products/${product.id}`, { data: { active: false } })
    }
    await cleanupRequest.dispose()
  }
})
