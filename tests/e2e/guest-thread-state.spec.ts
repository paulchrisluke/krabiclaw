import { dismissPreviewToolbar } from './helpers'
import { localDateAt, localNow } from '../../utils/timezone'
import { createHmac } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'
import type {
  GuestThreadDetailViewModel,
  GuestThreadListItemViewModel,
} from '../../server/domain/guest-threads/types'
import { loginAs } from './helpers/auth'
import { devLoginHeaders, testBaseUrl } from './test-env'

interface NotificationView {
  id: string
  title: string | null
  read_at: string | null
}

interface NotificationList {
  notifications: NotificationView[]
  unread_count: number
}

interface DeliveryView {
  id: string
  request_id: string
  entry_id: string
  purpose: string
  status: string
}

interface DeliveryList {
  deliveries: DeliveryView[]
}

const baseURL = testBaseUrl()
const siteId = 'site-pottery-house'
const ownerId = 'user-e2e-pottery-owner'
const secondOwnerId = 'user-e2e-pottery-location-owner'
const foreignOwnerId = 'user-e2e-kikuzuki-owner'
const writable = ['localhost', '127.0.0.1', 'preview.krabiclaw.com'].includes(new URL(baseURL).hostname)
const local = ['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)

async function expectStatus(response: APIResponse, status: number) {
  expect(response.status(), await response.text()).toBe(status)
}

// Far enough ahead that the slot is still in the future when the reservation POST
// re-reads availability a second or two later, and short enough that the unusable
// window at the end of the location's local day stays this many minutes wide.
const TODAY_SLOT_LEAD_MINUTES = 6

interface LocationSlot { date: string; time: string }

/**
 * A minute today that the location does not already serve, far enough ahead to still be
 * bookable, or null once today has run out — the caller skips rather than pretending a
 * booking could land.
 *
 * Cleanup deletes the override row outright, so this must never land on a slot loc-demo
 * already has: the editor calendar (read with includePast, so it covers the whole day)
 * says which minutes are taken, and minutes that are a multiple of five are skipped so
 * the time cannot sit on any ordinary 15/30/60-minute grid either.
 */
function openableMinuteToday(local: { date: string; time: string }, taken: ReadonlySet<string>): LocationSlot | null {
  const { date, time } = local
  const [hours, minutes] = time.split(':').map(Number)
  for (let minuteOfDay = hours! * 60 + minutes! + TODAY_SLOT_LEAD_MINUTES; minuteOfDay < 24 * 60; minuteOfDay += 1) {
    const slot = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`
    if (minuteOfDay % 5 !== 0 && !taken.has(slot)) return { date, time: slot }
  }
  return null
}

async function loadLocationDay(request: APIRequestContext, date: string) {
  const response = await request.get('/api/editor/sites/site-demo/locations/loc-demo/reservation-availability', {
    params: { from: date, to: date },
  })
  await expectStatus(response, 200)
  const { days } = await response.json() as { days: Array<{ slots: Array<{ time_slot: string }> }> }
  return new Set((days[0]?.slots ?? []).map(slot => slot.time_slot))
}

function setLocationSlot(request: APIRequestContext, slot: LocationSlot, directive: 'set' | 'inherit') {
  return request.put('/api/editor/sites/site-demo/locations/loc-demo/reservation-availability', {
    data: {
      changes: [{
        override_date: slot.date,
        time_slot: slot.time,
        directive,
        ...(directive === 'set' ? { status: 'open' } : {}),
      }],
    },
  })
}

// Set while the Today journey holds an opened slot, so the override is taken back even
// when the test fails partway and leaves loc-demo open at an hour it does not serve.
let openedTodaySlot: LocationSlot | null = null

test.afterEach(async ({ page }) => {
  if (!openedTodaySlot) return
  const slot = openedTodaySlot
  openedTodaySlot = null
  // A cleanup that quietly 4xxs would leave loc-demo open at an hour it does not serve,
  // and PUT resolves on any status, so the status is asserted rather than assumed.
  await expectStatus(await setLocationSlot(page.request, slot, 'inherit'), 200)
})

async function loadThreadList(request: APIRequestContext, search: string) {
  const response = await request.get(`/api/dashboard/sites/${siteId}/guest-threads`, {
    params: { search, type: 'contact' },
  })
  await expectStatus(response, 200)
  return await response.json() as { threads: GuestThreadListItemViewModel[] }
}

async function loadThreadDetail(
  request: APIRequestContext,
  threadId: string,
  targetSiteId = siteId,
) {
  const response = await request.get(`/api/dashboard/sites/${targetSiteId}/guest-threads/${threadId}`)
  await expectStatus(response, 200)
  return (await response.json() as { thread: GuestThreadDetailViewModel }).thread
}

async function loadNotifications(request: APIRequestContext) {
  const response = await request.get('/api/dashboard/notifications', { params: { limit: 50 } })
  await expectStatus(response, 200)
  return await response.json() as NotificationList
}

function contactNotification(state: NotificationList, guestName: string) {
  const notification = state.notifications.find(row => row.title === `New website message from ${guestName}`)
  expect(notification).toBeDefined()
  if (!notification) throw new Error('Contact notification was not visible to the owner')
  return notification
}

test('guest thread state stays source-owned, per-user, tenant-isolated, and idempotent', async ({ playwright }) => {
  test.skip(!writable, 'Guest-thread writes require disposable local or preview data')
  test.setTimeout(120_000)

  const owner = await playwright.request.newContext({ baseURL })
  const secondOwner = await playwright.request.newContext({ baseURL })
  const foreignOwner = await playwright.request.newContext({ baseURL })

  try {
    await Promise.all([
      loginAs(owner, baseURL, ownerId),
      loginAs(secondOwner, baseURL, secondOwnerId),
      loginAs(foreignOwner, baseURL, foreignOwnerId),
    ])

    const nonce = Date.now()
    const guestName = `Guest thread proof ${nonce}`
    const guestEmail = `guest-thread-${nonce}@playwright.example`
    const subject = 'partnerships'
    const message = `Canonical source detail proof ${nonce}`
    const startedAt = new Date().toISOString()
    const submission = await owner.post(`/api/public/sites/${siteId}/contact`, {
      data: { name: guestName, email: guestEmail, subject, message },
    })
    await expectStatus(submission, 201)

    const [ownerListBefore, secondOwnerListBefore, ownerNotificationsBefore, secondOwnerNotificationsBefore] = await Promise.all([
      loadThreadList(owner, guestName),
      loadThreadList(secondOwner, guestName),
      loadNotifications(owner),
      loadNotifications(secondOwner),
    ])
    expect(ownerListBefore.threads).toHaveLength(1)
    expect(secondOwnerListBefore.threads).toHaveLength(1)
    const threadId = ownerListBefore.threads[0]!.id
    const organizationList = await owner.get('/api/dashboard/guest-threads', {
      params: { org: 'org-user-pottery-house', search: guestName },
    })
    await expectStatus(organizationList, 200)
    expect(await organizationList.json()).toMatchObject({ threads: [{ id: threadId }] })
    await expectStatus(await foreignOwner.get('/api/dashboard/guest-threads', {
      params: { org: 'org-user-pottery-house', search: guestName },
    }), 404)
    expect(secondOwnerListBefore.threads[0]!.id).toBe(threadId)
    expect(ownerListBefore.threads[0]).toMatchObject({ guestName, submissionType: 'contact', unread: true })
    expect(secondOwnerListBefore.threads[0]).toMatchObject({ guestName, submissionType: 'contact', unread: true })
    expect(contactNotification(ownerNotificationsBefore, guestName).read_at).toBeNull()
    expect(contactNotification(secondOwnerNotificationsBefore, guestName).read_at).toBeNull()

    const detail = await loadThreadDetail(owner, threadId)
    expect(detail).toMatchObject({
      id: threadId,
      guestName,
      guestEmail,
      guestPhone: null,
      submissionType: 'contact',
      source: {
        submissionType: 'contact',
        operationalStatus: null,
        operationalStatusLabel: null,
        fields: { subject, message },
      },
    })
    const openingEntries = detail.entries.filter(entry => entry.kind === 'submission')
    expect(openingEntries).toHaveLength(1)
    expect(openingEntries[0]).toMatchObject({
      actorKind: 'guest',
      channel: 'web',
      body: null,
      eventName: null,
      payload: { kind: 'contact' },
    })

    const [ownerListAfterRead, ownerNotificationsAfterRead, secondOwnerListStillUnread, secondOwnerNotificationsStillUnread] = await Promise.all([
      loadThreadList(owner, guestName),
      loadNotifications(owner),
      loadThreadList(secondOwner, guestName),
      loadNotifications(secondOwner),
    ])
    expect(ownerListAfterRead.threads[0]).toMatchObject({ id: threadId, unread: false, unreadCount: 0 })
    expect(contactNotification(ownerNotificationsAfterRead, guestName).read_at).toEqual(expect.any(String))
    expect(secondOwnerListStillUnread.threads[0]).toMatchObject({ id: threadId, unread: true })
    expect(contactNotification(secondOwnerNotificationsStillUnread, guestName).read_at).toBeNull()

    await loadThreadDetail(secondOwner, threadId)
    const [secondOwnerListAfterRead, secondOwnerNotificationsAfterRead] = await Promise.all([
      loadThreadList(secondOwner, guestName),
      loadNotifications(secondOwner),
    ])
    expect(secondOwnerListAfterRead.threads[0]).toMatchObject({ id: threadId, unread: false, unreadCount: 0 })
    expect(contactNotification(secondOwnerNotificationsAfterRead, guestName).read_at).toEqual(expect.any(String))

    const foreignRead = await foreignOwner.get(`/api/dashboard/sites/${siteId}/guest-threads/${threadId}`)
    expect([403, 404]).toContain(foreignRead.status())
    const foreignMutation = await foreignOwner.post(`/api/dashboard/sites/${siteId}/guest-threads/${threadId}/operations/reply`, {
      data: { body: `Foreign reply ${nonce}`, idempotencyKey: `foreign-reply-${nonce}` },
    })
    expect([403, 404]).toContain(foreignMutation.status())

    const replyBody = `Idempotent owner reply ${nonce}`
    const idempotencyKey = `guest-thread-reply-${nonce}`
    const replyUrl = `/api/dashboard/sites/${siteId}/guest-threads/${threadId}/operations/reply`
    const sendReply = () => owner.post(replyUrl, {
      headers: { 'idempotency-key': idempotencyKey },
      data: { body: replyBody },
    })
    const concurrentReplies = await Promise.all([sendReply(), sendReply()])
    const concurrentReplyStatuses = concurrentReplies.map(response => response.status())
    expect(concurrentReplyStatuses).toContain(200)
    expect(concurrentReplyStatuses.every(status => status === 200 || status === 202)).toBe(true)
    await expectStatus(await sendReply(), 200)

    const afterReplies = await loadThreadDetail(owner, threadId)
    const replyEntries = afterReplies.entries.filter(entry => entry.kind === 'message' && entry.body === replyBody)
    expect(replyEntries).toHaveLength(1)
    expect(replyEntries[0]).toMatchObject({
      actorKind: 'member',
      actorUserId: ownerId,
      channel: 'email',
      eventName: 'thread.member_reply',
    })

    const deliveryResponse = await owner.get('/api/dev/notifications', {
      headers: devLoginHeaders(),
      params: { site_id: siteId, since: startedAt },
    })
    await expectStatus(deliveryResponse, 200)
    const deliveries = (await deliveryResponse.json() as DeliveryList).deliveries.filter(row =>
      row.request_id === threadId && row.purpose === 'member_reply',
    )
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]!.entry_id).toBe(replyEntries[0]!.id)

    const [ownerListAfterReply, ownerNotificationsAfterReply] = await Promise.all([
      loadThreadList(owner, guestName),
      loadNotifications(owner),
    ])
    expect(ownerListAfterReply.threads[0]).toMatchObject({
      id: threadId,
      conversationState: 'waiting_on_guest',
      unread: false,
      unreadCount: 0,
    })
    expect(contactNotification(ownerNotificationsAfterReply, guestName).read_at).toEqual(expect.any(String))
  } finally {
    await Promise.all([owner.dispose(), secondOwner.dispose(), foreignOwner.dispose()])
  }
})

test('Today uses the CMS patterns and sends one reservation change request', async ({ page }) => {
  test.skip(!writable, 'Today writes require disposable local or preview data')
  test.setTimeout(180_000)
  await loginAs(page.request, baseURL)

  const now = Date.now()
  const firstName = `Maya${now}`
  const guestName = `${firstName} Chen`
  const guestEmail = `maya-${now}@example.test`
  const availability = await page.request.get('/api/public/sites/site-demo/reservations/availability', {
    params: { date: new Date(now).toISOString().slice(0, 10), location_id: 'loc-demo' },
  })
  await expectStatus(availability, 200)
  const { timezone } = await availability.json() as { timezone: string }
  expect(timezone).toEqual(expect.any(String))
  // The Today tab shows only bookings whose day key equals the *location's* current
  // local day (listTodayAgenda), and listReservationSlots drops every slot already in
  // the past. loc-demo's ordinary hours end at 20:00 Asia/Bangkok, so once CI runs
  // after that — 13:00-17:00 UTC, every day — the location's today has no bookable
  // slot left and a guest who "arrives today" cannot be created at all. Opening a slot
  // for the rest of today is what the availability override exists for, so the test
  // opens one instead of depending on the hour CI happens to start.
  // One reading of the location's clock feeds both the calendar lookup and the chosen
  // minute; reading it twice could straddle local midnight and write the override to a
  // different day than the one checked for collisions.
  const localToday = localNow(timezone)
  const todaySlot = openableMinuteToday(localToday, await loadLocationDay(page.request, localToday.date))
  test.skip(
    !todaySlot,
    `${timezone} is within ${TODAY_SLOT_LEAD_MINUTES} minutes of midnight, so no reservation can still arrive today`,
  )
  await expectStatus(await setLocationSlot(page.request, todaySlot!, 'set'), 200)
  openedTodaySlot = todaySlot!

  const bookingIds: string[] = []
  for (const [name, email, plan] of [
    [guestName, guestEmail, todaySlot!],
    [`Priya${now} Patel`, `priya-${now}@example.test`, now + 86_400_000],
  ] as const) {
    let date: string
    let time: string
    if (typeof plan === 'number') {
      // The upcoming guest only has to land on some later day the location is open,
      // so it takes the location's own availability and walks forward to find one.
      let slot: { time_slot: string } | undefined
      date = localDateAt(new Date(plan), timezone)
      for (let dayOffset = 0; dayOffset < 4 && !slot; dayOffset += 1) {
        date = localDateAt(new Date(plan + dayOffset * 86_400_000), timezone)
        const day = await page.request.get('/api/public/sites/site-demo/reservations/availability', { params: { date, location_id: 'loc-demo' } })
        await expectStatus(day, 200)
        // is_closed answers whether the location serves the time, not whether anyone is
        // left to seat: a slot at capacity comes back is_full with is_closed false, and
        // booking it fails the POST with a 409 the loop could have avoided by trying the
        // next slot or the next day.
        const { dates } = await day.json() as { dates: Array<{ slots: Array<{ time_slot: string; is_closed: boolean; is_full: boolean }> }> }
        slot = dates[0]?.slots.filter(candidate => !candidate.is_closed && !candidate.is_full).at(-1)
      }
      expect(slot, `loc-demo offers no open slot within four days of ${localDateAt(new Date(plan), timezone)}`).toBeTruthy()
      time = slot!.time_slot
    } else {
      ({ date, time } = plan)
    }
    const response = await page.request.post('/api/public/sites/site-demo/reservations', {
      data: { name, email, phone: '+12025550123', date, time, guests: '2', location_id: 'loc-demo' },
    })
    await expectStatus(response, 201)
    const { id } = await response.json() as { id: string }
    expect(id).toEqual(expect.any(String))
    bookingIds.push(id)
  }
  const upcomingBookingId = bookingIds[1]!

  await dismissPreviewToolbar(page)

  await page.goto(`${baseURL}/dashboard/ember-slice-demo`)
  const heading = page.getByRole('heading', { name: /^You have \d+ (?:bookings?|reservations?)$/ })
  await expect(heading).toBeVisible()
  expect(await heading.evaluate(element => getComputedStyle(element).textAlign)).toBe('center')
  await expect(page.getByRole('tab', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Upcoming', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filter bookings', exact: true })).toBeVisible()

  await page.getByRole('link', { name: new RegExp(`${firstName} arrives today`) }).click()
  await expect(page.getByRole('heading', { name: 'Currently hosting', exact: true })).toBeVisible()
  await expect(page.getByText(guestName, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(guestEmail, { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: guestName }).last().click()
  await expect(page.getByText(guestEmail, { exact: true })).toBeVisible()
  await page.goBack()

  const note = `Today page note ${Date.now()}`
  await page.getByRole('link', { name: 'Add a note to yourself', exact: true }).click()
  await page.getByLabel('Note', { exact: true }).fill(note)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(note, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: `Edit note: ${note}` }).click()
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue(note)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.getByRole('button', { name: 'Manage reservation', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('link', { name: 'Change reservation', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What do you want to change?', exact: true })).toBeVisible()
  await expect(page.getByText(new RegExp(`send a request to your guest, ${firstName}, to confirm the alterations to your reservation`, 'i'))).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reservation details', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send request', exact: true })).toBeVisible()

  await page.goto(`${baseURL}/dashboard/ember-slice-demo/bookings/reservation/${upcomingBookingId}/change`)
  const beforeResponse = await page.request.get(
    `/api/dashboard/bookings/reservation/${upcomingBookingId}`,
    { params: { org: 'ember-slice-demo' } },
  )
  await expectStatus(beforeResponse, 200)
  const before = await beforeResponse.json() as { booking: { partySize: number; threadId: string } }
  const targetPartySize = before.booking.partySize === 99 ? 98 : before.booking.partySize + 1
  await page.getByRole('link', { name: 'Change guests', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Guests', exact: true }).fill(String(targetPartySize))
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const requestedAt = new Date().toISOString()
  const requestCompleted = page.waitForResponse(response =>
    response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith(`/api/dashboard/bookings/reservation/${upcomingBookingId}/changes`),
  )
  await page.getByRole('button', { name: 'Send request', exact: true }).click()
  const changeResponse = await requestCompleted
  expect(changeResponse.status(), await changeResponse.text()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Coming up', exact: true })).toBeVisible({ timeout: 30_000 })

  const detail = await loadThreadDetail(page.request, before.booking.threadId, 'site-demo')
  const requests = detail.entries.filter(entry =>
    entry.eventName === 'booking_change.requested' && entry.occurredAt >= requestedAt,
  )
  expect(requests).toHaveLength(1)
  expect(requests[0]!.payload).toMatchObject({ after: { partySize: targetPartySize } })
  const deliveryResponse = await page.request.get('/api/dev/notifications', {
    headers: devLoginHeaders(),
    params: { site_id: 'site-demo', since: requestedAt },
  })
  await expectStatus(deliveryResponse, 200)
  const deliveries = (await deliveryResponse.json() as DeliveryList).deliveries.filter(row => row.entry_id === requests[0]!.id)
  expect(deliveries.some(row => row.purpose === 'status_update' && row.status === 'sent')).toBe(true)
  expect(deliveries.some(row => row.purpose === 'owner_alert' && row.status === 'sent')).toBe(true)

  if (local) {
    const request = requests[0]!
    const token = createHmac('sha256', 'local-playwright-email-reply-secret')
      .update(`booking-change:v1:${before.booking.threadId}:${request.id}`)
      .digest('hex')
    const accepted = await page.request.post(
      `/api/public/booking-changes/${before.booking.threadId}/${request.id}`,
      { headers: { authorization: `Bearer ${token}` }, data: { decision: 'accept' } },
    )
    await expectStatus(accepted, 200)
    expect(await accepted.json()).toMatchObject({ status: 'accepted' })

    const afterResponse = await page.request.get(
      `/api/dashboard/bookings/reservation/${upcomingBookingId}`,
      { params: { org: 'ember-slice-demo' } },
    )
    await expectStatus(afterResponse, 200)
    expect(await afterResponse.json()).toMatchObject({ booking: { partySize: targetPartySize } })
    const afterDetail = await loadThreadDetail(page.request, before.booking.threadId, 'site-demo')
    expect(afterDetail.entries.filter(entry =>
      entry.eventName === 'booking_change.accepted'
      && entry.payload?.requestId === request.id,
    )).toHaveLength(1)
  }
})
