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
  thread_id: string
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
        fields: { subject, message },
      },
    })
    const openingEntries = detail.entries.filter(entry => entry.kind === 'submission')
    expect(openingEntries).toHaveLength(1)
    expect(openingEntries[0]).toMatchObject({
      actorKind: 'guest',
      channel: 'system',
      body: null,
      eventName: 'contact_submitted',
      payload: null,
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
      row.thread_id === threadId && row.purpose === 'member_reply',
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
  test.setTimeout(120_000)
  await loginAs(page.request, baseURL)

  await page.goto(`${baseURL}/dashboard/ember-slice-demo`)
  const heading = page.getByRole('heading', { name: /^You have \d+ (?:bookings|reservations)$/ })
  await expect(heading).toBeVisible()
  expect(await heading.evaluate(element => getComputedStyle(element).textAlign)).toBe('center')
  await expect(page.getByRole('tab', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Upcoming', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filter bookings', exact: true })).toBeVisible()

  // Cloudflare injects its own preview toolbar outside the application bundle.
  // Its empty modal container otherwise covers the page during preview-only CI.
  const cloudflarePreviewModal = page.locator('.cf_modal_container')
  if (await cloudflarePreviewModal.count()) {
    await cloudflarePreviewModal.evaluate(element => element.remove())
  }
  await page.getByRole('link', { name: /Maya arrives today/i }).click()
  await expect(page.getByRole('heading', { name: 'Currently hosting', exact: true })).toBeVisible()
  await expect(page.getByText('Maya Chen', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('maya.today@example.test', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: /Maya Chen/ }).last().click()
  await expect(page.getByText('maya.today@example.test', { exact: true })).toBeVisible()
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
  await expect(page.getByText(/send a request to your guest, Maya, to confirm the alterations to your reservation/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Reservation details', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send request', exact: true })).toBeVisible()

  await page.goto(`${baseURL}/dashboard/ember-slice-demo/bookings/reservation/reservation-demo-upcoming-priya/change`)
  const beforeResponse = await page.request.get(
    '/api/dashboard/bookings/reservation/reservation-demo-upcoming-priya',
    { params: { org: 'ember-slice-demo' } },
  )
  await expectStatus(beforeResponse, 200)
  const before = await beforeResponse.json() as { booking: { partySize: number; threadId: string } }
  const targetPartySize = before.booking.partySize === 99 ? 98 : before.booking.partySize + 1
  await page.getByRole('link', { name: 'Change guests', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Guests', exact: true }).fill(String(targetPartySize))
  await page.goBack()
  const requestedAt = new Date().toISOString()
  await page.getByRole('button', { name: 'Send request', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Coming up', exact: true })).toBeVisible()

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
      '/api/dashboard/bookings/reservation/reservation-demo-upcoming-priya',
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
