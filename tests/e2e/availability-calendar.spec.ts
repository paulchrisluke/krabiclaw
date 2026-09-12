import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { devLoginHeaders, testBaseUrl } from './test-env'

const baseURL = testBaseUrl()
const writable = ['localhost', '127.0.0.1', 'preview.krabiclaw.com'].includes(new URL(baseURL).hostname)
const availabilityUrl = `${baseURL}/api/editor/sites/site-demo/locations/loc-demo/reservation-availability`

interface Slot { time_slot: string; capacity: number | null; claimed: number; remaining: number | null; is_closed: boolean; is_full: boolean }
interface Day { date: string; timezone: string; slots: Slot[] }

/**
 * The reservation calendar covers a LOCATION and nothing else.
 *
 * A Product's occurrences are real session rows with their own screen; folding
 * the two into one calendar is what made a session look like a slot that could
 * be reopened. Session capacity and its races are proven directly in
 * tests/integration/availability-d1.test.ts.
 */
test('reservation overrides close specific slots and never leak their private note', async ({ page, request }) => {
  test.skip(!writable, 'Calendar writes require disposable local or preview data')
  test.setTimeout(90_000)
  await loginAs(page.request, baseURL)

  const today = new Date()
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 20)).toISOString().slice(0, 10)
  const before = await page.request.get(availabilityUrl, { params: { from: date, to: date }, headers: devLoginHeaders() ?? {} })
  expect(before.status(), await before.text()).toBe(200)
  const { days }: { days: Day[] } = await before.json()
  expect(days).toHaveLength(1)
  const openSlot = days[0]!.slots.find(slot => !slot.is_closed)
  expect(openSlot, `loc-demo offers no open reservation slot on ${date}`).toBeTruthy()

  const note = `Private calendar proof ${Date.now()}`
  const configured = await page.request.put(availabilityUrl, {
    headers: devLoginHeaders() ?? {},
    data: { changes: [{ override_date: date, time_slot: openSlot!.time_slot, directive: 'set', status: 'closed', note }] },
  })
  expect(configured.status(), await configured.text()).toBe(200)

  const after = await page.request.get(availabilityUrl, { params: { from: date, to: date }, headers: devLoginHeaders() ?? {} })
  expect(after.status()).toBe(200)
  const { days: closedDays }: { days: Day[] } = await after.json()
  expect(closedDays[0]!.slots.find(slot => slot.time_slot === openSlot!.time_slot)?.is_closed).toBe(true)

  // The guest-facing read shows the closure and never the note behind it.
  const publicResponse = await request.get(`${baseURL}/api/public/sites/site-demo/reservations/availability`, {
    params: { location_id: 'loc-demo', date, days: 1 },
  })
  expect(publicResponse.status(), await publicResponse.text()).toBe(200)
  const publicText = await publicResponse.text()
  expect(publicText).not.toContain(note)

  // 'inherit' removes the override so the location's ordinary hours decide
  // again — which is different from setting the slot open.
  const restored = await page.request.put(availabilityUrl, {
    headers: devLoginHeaders() ?? {},
    data: { changes: [{ override_date: date, time_slot: openSlot!.time_slot, directive: 'inherit' }] },
  })
  expect(restored.status(), await restored.text()).toBe(200)
  const final = await page.request.get(availabilityUrl, { params: { from: date, to: date }, headers: devLoginHeaders() ?? {} })
  const { days: restoredDays }: { days: Day[] } = await final.json()
  expect(restoredDays[0]!.slots.find(slot => slot.time_slot === openSlot!.time_slot)?.is_closed).toBe(false)
})

test('concurrent guests cannot claim the same final reservation seat', async ({ page, request }) => {
  test.skip(!writable, 'Booking writes require disposable local or preview data')
  await loginAs(page.request, baseURL)
  const today = new Date()
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 21)).toISOString().slice(0, 10)

  const read = await page.request.get(availabilityUrl, { params: { from: date, to: date }, headers: devLoginHeaders() ?? {} })
  expect(read.status(), await read.text()).toBe(200)
  const { days }: { days: Day[] } = await read.json()
  const slot = days[0]!.slots.find(entry => !entry.is_closed)
  expect(slot, `loc-demo offers no open reservation slot on ${date}`).toBeTruthy()

  // One seat left, two guests: the claim carries its own capacity predicate,
  // so one lands and the other is told, never overbooked.
  const capacity = slot!.claimed + 1
  const configured = await page.request.put(availabilityUrl, {
    headers: devLoginHeaders() ?? {},
    data: { changes: [{ override_date: date, time_slot: slot!.time_slot, directive: 'set', status: 'open', capacity, note: null }] },
  })
  expect(configured.status(), await configured.text()).toBe(200)

  const attempt = Date.now()
  const results = await Promise.all([1, 2].map(guest => request.post(`${baseURL}/api/public/sites/site-demo/reservations`, {
    data: {
      name: `Last seat guest ${guest}`,
      email: `last-seat-${attempt}-${guest}@playwright.example`,
      phone: '+66812345678',
      location_id: 'loc-demo',
      date,
      time: slot!.time_slot,
      guests: '1',
    },
  })))
  expect(results.map(result => result.status()).sort()).toEqual([201, 409])

  const final = await page.request.get(availabilityUrl, { params: { from: date, to: date }, headers: devLoginHeaders() ?? {} })
  const { days: finalDays }: { days: Day[] } = await final.json()
  expect(finalDays[0]!.slots.find(entry => entry.time_slot === slot!.time_slot)).toMatchObject({
    capacity, remaining: 0, is_full: true, is_closed: false,
  })
})
