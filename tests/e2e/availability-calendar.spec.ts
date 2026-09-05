import { expect, test } from '@playwright/test'
import type { AvailabilityCalendar } from '../../server/utils/availability'
import { loginAs } from './helpers/auth'
import { devLoginHeaders, testBaseUrl } from './test-env'

const baseURL = testBaseUrl()
const writable = ['localhost', '127.0.0.1', 'preview.krabiclaw.com'].includes(new URL(baseURL).hostname)

test('calendar range edits persist and public availability excludes private notes', async ({ page, request }) => {
  test.skip(!writable, 'Calendar writes require disposable local or preview data')
  await page.context().setExtraHTTPHeaders(devLoginHeaders() ?? {})
  await loginAs(page.request, baseURL)
  const calendarResponse = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/site-demo/availability'))
  await page.goto(`${baseURL}/dashboard/ember-slice-demo/calendar?view=availability&siteId=site-demo&locationId=loc-demo`)
  const initialResponse = await calendarResponse
  expect(initialResponse.status(), await initialResponse.text()).toBe(200)
  const nextMonth = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('/site-demo/availability'))
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  const response = await nextMonth
  expect(response.status(), await response.text()).toBe(200)
  const { calendar }: { calendar: AvailabilityCalendar } = await response.json()
  const owner = calendar.owners.find(row => row.owner.kind === 'experience' && row.owner.experienceId === 'exp-demo-pizza-class')
  expect(owner).toBeDefined()
  if (!owner) throw new Error('Demo pizza schedule missing from the calendar')
  const days = owner.days.slice(9, 12)
  expect(days).toHaveLength(3)
  const first = page.getByRole('button', { name: new RegExp(`^Pizza Making Class, ${days[0]!.date},`) })
  const last = page.getByRole('button', { name: new RegExp(`^Pizza Making Class, ${days[2]!.date},`) })
  await last.scrollIntoViewIfNeeded()
  const start = await first.boundingBox()
  const end = await last.boundingBox()
  if (!start || !end) throw new Error('Date range is not visible')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 })
  await page.mouse.up()
  const panel = page.getByRole('dialog', { name: 'Edit availability' })
  await expect(panel).toContainText(`${days[0]!.date} to ${days[2]!.date}`)
  await panel.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Blocked by you', exact: true }).click()
  const note = `Private calendar proof ${Date.now()}`
  await panel.getByLabel('Private note', { exact: true }).fill(note)
  const saved = page.waitForResponse(result => result.request().method() === 'PUT' && result.url().includes('/site-demo/availability'))
  await panel.getByRole('button', { name: 'Save changes' }).click()
  const savedResponse = await saved
  expect(savedResponse.status(), await savedResponse.text()).toBe(200)
  await expect(panel).not.toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  for (const day of days) {
    const cell = page.getByRole('button', { name: `Pizza Making Class, ${day.date}, Blocked`, exact: true })
    await expect(cell).toContainText(note)
  }

  const publicResponse = await request.get(`${baseURL}/api/public/sites/site-demo/experiences/pizza-making-class/availability`, {
    params: { date: days[0]!.date, days: 3 },
  })
  expect(publicResponse.status(), await publicResponse.text()).toBe(200)
  const publicText = await publicResponse.text()
  expect(publicText).not.toContain(note)
  const publicAvailability: { dates: Array<{ slots: Array<{ is_closed: boolean }> }> } = JSON.parse(publicText)
  expect(publicAvailability.dates).toHaveLength(3)
  for (const day of publicAvailability.dates) {
    expect(day.slots.length).toBeGreaterThan(0)
    expect(day.slots.every(slot => slot.is_closed)).toBe(true)
  }

  await page.getByRole('button', { name: /load next month/i }).click()
  await expect(page.getByTestId('availability-calendar')).toHaveCount(2)
})

test('concurrent guests cannot claim the same final seat in an open override', async ({ page, request }) => {
  test.skip(!writable, 'Booking writes require disposable local or preview data')
  await loginAs(page.request, baseURL)
  const today = new Date()
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 20)).toISOString().slice(0, 10)
  const availabilityUrl = `${baseURL}/api/editor/sites/site-demo/availability?org=ember-slice-demo`
  const configured = await page.request.put(availabilityUrl, {
    data: {
      owner: { kind: 'experience', experienceId: 'exp-demo-pizza-class' },
      changes: [{ override_date: date, time_slot: '23:30', directive: 'set', status: 'open', capacity_override: 1, note: null }],
    },
  })
  expect(configured.status(), await configured.text()).toBe(200)
  const attempt = Date.now()
  const results = await Promise.all([1, 2].map(guest => request.post(
    `${baseURL}/api/public/sites/site-demo/experiences/pizza-making-class/book`,
    {
      data: {
        guest_name: `Last seat guest ${guest}`,
        guest_email: `last-seat-${attempt}-${guest}@playwright.example`,
        guest_phone: '+66812345678',
        booking_date: date,
        time_slot: '23:30',
        party_size: 1,
      },
    },
  )))
  expect(results.map(result => result.status()).sort()).toEqual([201, 409])
  const read = await page.request.get(availabilityUrl, {
    params: { location_id: 'loc-demo', from: date, to: date, owner_type: 'experience', owner_id: 'exp-demo-pizza-class' },
  })
  expect(read.status(), await read.text()).toBe(200)
  const { calendar }: { calendar: AvailabilityCalendar } = await read.json()
  const day = calendar.owners[0]!.days[0]!
  expect(day.bookings.filter(booking => booking.time_slot === '23:30')).toHaveLength(1)
  expect(day.slots.find(slot => slot.time_slot === '23:30')).toMatchObject({
    booked: 1, remaining: 0, is_full: true, is_closed: false,
  })
})
