import { expect, test, type APIRequestContext } from '@playwright/test'
import { collectPageErrors, setupTenantHeaders, tenantBaseURL } from './helpers'
import { devLoginHeaders, devLoginUrl } from './test-env'
import { demoFixture } from '../../seed-definitions/demo'

const demoSiteId = demoFixture.siteId
const demoExperience = demoFixture.experiences[0]!
const demoOrgSlug = demoFixture.site.slug
const demoSiteSlug = demoFixture.site.subdomain
const demoLocationSlug = demoFixture.locations[0]!.slug

const devHeaders = () => devLoginHeaders() ?? {}

const devUrl = (baseURL: string, path: string, params?: Record<string, string>) => {
  const url = new URL(`${baseURL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value)
  return url.toString()
}

type SubmissionMessageRow = {
  id: string
  submission_type: string
  submission_id: string
  direction: string
  channel: string
  body: string
  meta_message_id: string | null
  created_at: string
}

type NotificationRow = {
  id: string
  channel: string
  template: string
  title: string
  status: string
}

async function waitForSubmissionMessages(
  request: APIRequestContext,
  baseURL: string,
  params: Record<string, string>,
  predicate: (_rows: SubmissionMessageRow[]) => boolean,
  options?: { timeoutMs?: number; intervalMs?: number },
) {
  const timeoutMs = options?.timeoutMs ?? 8_000
  const intervalMs = options?.intervalMs ?? 250
  const deadline = Date.now() + timeoutMs
  let lastRows: SubmissionMessageRow[] = []

  while (Date.now() < deadline) {
    const res = await request.get(devUrl(baseURL, '/api/dev/submission-messages', params), { headers: devHeaders() })
    expect(res.status()).toBe(200)
    const payload = await res.json() as { messages: SubmissionMessageRow[] }
    lastRows = payload.messages
    if (predicate(lastRows)) return lastRows
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Timed out waiting for submission messages after ${timeoutMs}ms`)
}

async function waitForReplyNotification(
  request: APIRequestContext,
  baseURL: string,
  siteId: string,
  since: string,
  template: string,
) {
  const deadline = Date.now() + 8_000
  let lastRows: NotificationRow[] = []

  while (Date.now() < deadline) {
    const res = await request.get(
      devUrl(baseURL, '/api/dev/notifications', { site_id: siteId, since, template }),
      { headers: devHeaders() },
    )
    expect(res.status()).toBe(200)
    const payload = await res.json() as { notifications: NotificationRow[] }
    lastRows = payload.notifications
    if (lastRows.length > 0) return lastRows
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for notification template ${template}`)
}

test.describe('reply threading', () => {
  test.describe.configure({ mode: 'serial' })

  test('reservation email reply ingestion writes a guest thread message', async ({ request }) => {
    const futureDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
    const since = new Date().toISOString()
    const guestEmail = `reply-res-${Date.now()}@playwright.example`

    const createRes = await request.post(`${tenantBaseURL}/api/public/sites/${demoSiteId}/reservations`, {
      data: {
        name: 'Reply Reservation Test',
        email: guestEmail,
        phone: '+15555550301',
        date: futureDate,
        time: '19:00',
        guests: '2',
        location_id: 'loc-demo',
      },
    })
    expect(createRes.status()).toBe(201)
    const createBody = await createRes.json() as { id: string }

    const inboundRes = await request.post(`${tenantBaseURL}/api/dev/inbound-email`, {
      headers: devHeaders(),
      data: {
        submissionType: 'reservation',
        submissionId: createBody.id,
        from: 'guest@example.test',
        body: 'Can we sit outside if available?',
      },
    })
    expect(inboundRes.status()).toBe(200)

    const messages = await waitForSubmissionMessages(
      request,
      tenantBaseURL,
      { submission_type: 'reservation', submission_id: createBody.id, direction: 'in', channel: 'email', since },
      rows => rows.some(row => row.body.includes('sit outside')),
    )
    expect(messages[0]?.body).toContain('sit outside')

    const notifications = await waitForReplyNotification(
      request,
      tenantBaseURL,
      demoSiteId,
      since,
      'submission_reply_email',
    )
    expect(notifications[0]?.channel).toBe('dashboard')
  })

  test('experience email reply ingestion writes a guest thread message', async ({ request }) => {
    const uniqueDaysOffset = 200 + (Math.floor(Date.now() / 60_000) % 500)
    const futureDate = new Date(Date.now() + uniqueDaysOffset * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
    const since = new Date().toISOString()
    const guestEmail = `reply-exp-${Date.now()}@playwright.example`

    const createRes = await request.post(`${tenantBaseURL}/api/public/sites/${demoSiteId}/experiences/${demoExperience.slug}/book`, {
      data: {
        guest_name: 'Reply Experience Test',
        guest_email: guestEmail,
        party_size: 1,
        booking_date: futureDate,
        time_slot: '14:00',
      },
    })
    expect(createRes.status()).toBe(201)
    const createBody = await createRes.json() as { booking_id: string }

    const inboundRes = await request.post(`${tenantBaseURL}/api/dev/inbound-email`, {
      headers: devHeaders(),
      data: {
        submissionType: 'experience_booking',
        submissionId: createBody.booking_id,
        from: 'guest@example.test',
        body: 'Is closed-toe footwear required?',
      },
    })
    expect(inboundRes.status()).toBe(200)

    const messages = await waitForSubmissionMessages(
      request,
      tenantBaseURL,
      { submission_type: 'experience_booking', submission_id: createBody.booking_id, direction: 'in', channel: 'email', since },
      rows => rows.some(row => row.body.includes('closed-toe')),
    )
    expect(messages[0]?.body).toContain('closed-toe')

    const notifications = await waitForReplyNotification(
      request,
      tenantBaseURL,
      demoSiteId,
      since,
      'submission_reply_email',
    )
    expect(notifications[0]?.channel).toBe('dashboard')
  })

  test('whatsapp guest reply is matched back to the reservation by phone', async ({ request }) => {
    const futureDate = new Date(Date.now() + 41 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
    const since = new Date().toISOString()
    const guestPhone = '+15555550302'

    const createRes = await request.post(`${tenantBaseURL}/api/public/sites/${demoSiteId}/reservations`, {
      data: {
        name: 'Reply WhatsApp Test',
        email: `reply-wa-${Date.now()}@playwright.example`,
        phone: guestPhone,
        date: futureDate,
        time: '18:30',
        guests: '2',
        location_id: 'loc-demo',
      },
    })
    expect(createRes.status()).toBe(201)
    const createBody = await createRes.json() as { id: string }

    const inboundRes = await request.post(`${tenantBaseURL}/api/dev/inbound-whatsapp`, {
      headers: devHeaders(),
      data: {
        from: guestPhone,
        body: 'Running 10 minutes late.',
        siteId: demoSiteId,
      },
    })
    expect(inboundRes.status()).toBe(200)

    const messages = await waitForSubmissionMessages(
      request,
      tenantBaseURL,
      { submission_type: 'reservation', submission_id: createBody.id, direction: 'in', channel: 'whatsapp', since },
      rows => rows.some(row => row.body.includes('10 minutes late')),
    )
    expect(messages[0]?.body).toContain('10 minutes late')

    const notifications = await waitForReplyNotification(
      request,
      tenantBaseURL,
      demoSiteId,
      since,
      'submission_reply_whatsapp',
    )
    expect(notifications[0]?.channel).toBe('dashboard')
  })

  test('owner can send a reservation email reply from the deep-linked dashboard inbox', async ({ page, request, baseURL }) => {
    test.setTimeout(60_000)

    const futureDate = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
    const since = new Date().toISOString()
    const guestEmail = `owner-reply-${Date.now()}@playwright.example`
    const replyBody = `Thanks for your reservation. We have you down for 7:00 PM. Ref ${Date.now()}`

    const createRes = await request.post(`${tenantBaseURL}/api/public/sites/${demoSiteId}/reservations`, {
      data: {
        name: 'Owner Reply Flow Test',
        email: guestEmail,
        phone: '+15555550303',
        date: futureDate,
        time: '19:00',
        guests: '2',
        requests: 'Window seat if possible',
        location_id: 'loc-demo',
      },
    })
    expect(createRes.status()).toBe(201)
    const createBody = await createRes.json() as { id: string }

    const errors = collectPageErrors(page)
    await setupTenantHeaders(page, baseURL!, devHeaders())

    const login = await page.goto(devLoginUrl(baseURL!, 'user-demo'), { waitUntil: 'load' })
    expect(login?.status()).toBeLessThan(400)

    const inboxUrl = `${baseURL}/dashboard/${demoOrgSlug}/sites/${demoSiteSlug}/${demoLocationSlug}/inbox?tab=reservations&reply=${createBody.id}`
    const inboxResponse = await page.goto(inboxUrl, { waitUntil: 'load' })
    expect(inboxResponse?.status()).toBeLessThan(400)

    await expect(page.locator('body')).toContainText('Reservations')
    await expect(page.getByRole('heading', { name: 'Reply to guest' })).toBeVisible()
    await expect(page.locator('body')).toContainText('Replies from this inbox are sent by email.')

    await page.getByPlaceholder('Write your email reply...').fill(replyBody)
    await page.getByRole('button', { name: 'Send reply' }).click()

    await expect(page.locator('body')).toContainText('Reply sent')
    await expect(page.getByRole('heading', { name: 'Reply to guest' })).toBeHidden()

    const messages = await waitForSubmissionMessages(
      request,
      tenantBaseURL,
      { submission_type: 'reservation', submission_id: createBody.id, direction: 'out', channel: 'email', since },
      rows => rows.some((row) => row.body.includes(replyBody)),
      { timeoutMs: 12_000 },
    )
    expect(messages.some((row) => row.body === replyBody)).toBe(true)

    const appErrors = errors.filter((error) => !error.includes('Hydration completed but contains mismatches.'))
    expect(appErrors).toEqual([])
  })
})
