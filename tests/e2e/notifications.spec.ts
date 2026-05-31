import { expect, test } from '@playwright/test'
import { potteryHouseBaseURL, tenantBaseURL } from './helpers'

// Verify that submission APIs correctly trigger notification records in the DB.
// Notification delivery (Resend email, WhatsApp) requires live credentials — those
// are tested by checking the notifications table row exists and reflects the correct
// attempt status, not by intercepting the external provider.
//
// Uses GET /api/dev/notifications (dev-only) to read notification records after each submission.

const devNotificationsUrl = (baseURL: string, params: Record<string, string>) => {
  const url = new URL(`${baseURL}/api/dev/notifications`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

type NotificationRow = {
  id: string
  channel: string
  template: string
  title: string
  status: string
  error: string | null
  recipient: string | null
}

test.describe('notification records — contact form', () => {
  test('pottery house contact submission creates dashboard + email notification records', async ({ request }) => {
    const since = new Date().toISOString()
    const guestEmail = `test-contact-${Date.now()}@playwright.example`

    const res = await request.post(
      `${potteryHouseBaseURL}/api/public/sites/site-pottery-house/contact`,
      {
        data: {
          name: 'Playwright Contact Test',
          email: guestEmail,
          message: 'This is a Playwright E2E notification test. Please ignore.',
        },
      },
    )
    expect(res.status()).toBe(201)

    // Allow fire-and-forget notification writes to complete (email status update is async)
    await new Promise(r => setTimeout(r, 2000))

    const notifRes = await request.get(
      devNotificationsUrl(potteryHouseBaseURL, { site_id: 'site-pottery-house', since }),
    )
    expect(notifRes.status()).toBe(200)
    const { notifications } = await notifRes.json() as { notifications: NotificationRow[] }

    // Dashboard in-app notification (always written synchronously)
    const dashboard = notifications.find(n => n.channel === 'dashboard' && n.template === 'new_contact_msg')
    expect(dashboard).toBeDefined()
    expect(dashboard?.status).toBe('sent')
    expect(dashboard?.title).toContain('Playwright Contact Test')

    // Owner email notification (attempted — fails locally without RESEND_API_KEY)
    const ownerEmail = notifications.find(n => n.channel === 'email' && n.template === 'new_contact_msg')
    expect(ownerEmail).toBeDefined()
    expect(['sent', 'failed', 'pending']).toContain(ownerEmail?.status)

    // Guest acknowledgement email
    const guestEmail_ = notifications.find(n => n.channel === 'email' && n.template === 'contact_customer_received')
    expect(guestEmail_).toBeDefined()
    expect(guestEmail_?.recipient).toBe(guestEmail)
    expect(['sent', 'failed', 'pending']).toContain(guestEmail_?.status)
  })
})

test.describe('notification records — restaurant reservation (demo site)', () => {
  test('reservation submission creates dashboard + email notification records', async ({ request }) => {
    const since = new Date().toISOString()
    const guestEmail = `test-res-${Date.now()}@playwright.example`
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

    const res = await request.post(
      `${tenantBaseURL}/api/public/sites/site-demo/reservations`,
      {
        data: {
          name: 'Playwright Reservation Test',
          email: guestEmail,
          phone: '+15555550199',
          date: futureDate,
          time: '19:00',
          guests: '2',
          requests: 'Playwright E2E notification test',
        },
      },
    )
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.id).toEqual(expect.any(String))

    await new Promise(r => setTimeout(r, 2000))

    const notifRes = await request.get(
      devNotificationsUrl(tenantBaseURL, { site_id: 'site-demo', since }),
    )
    expect(notifRes.status()).toBe(200)
    const { notifications } = await notifRes.json() as { notifications: NotificationRow[] }

    // Dashboard in-app notification
    const dashboard = notifications.find(n => n.channel === 'dashboard' && n.template === 'new_reservation')
    expect(dashboard).toBeDefined()
    expect(dashboard?.status).toBe('sent')
    expect(dashboard?.title).toContain('Playwright Reservation Test')

    // Owner email
    const ownerEmail = notifications.find(n => n.channel === 'email' && n.template === 'new_reservation')
    expect(ownerEmail).toBeDefined()
    expect(['sent', 'failed']).toContain(ownerEmail?.status)

    // Guest confirmation email
    const guestConfirm = notifications.find(n => n.channel === 'email' && n.template === 'reservation_customer_received')
    expect(guestConfirm).toBeDefined()
    expect(guestConfirm?.recipient).toBe(guestEmail)
    expect(['sent', 'failed']).toContain(guestConfirm?.status)
  })

  test('reservation cancellation creates dashboard + email notification records', async ({ request }) => {
    const since = new Date().toISOString()
    const guestEmail = `test-cancel-${Date.now()}@playwright.example`
    const futureDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

    const createRes = await request.post(
      `${tenantBaseURL}/api/public/sites/site-demo/reservations`,
      {
        data: {
          name: 'Playwright Cancel Test',
          email: guestEmail,
          phone: '+15555550200',
          date: futureDate,
          time: '18:00',
          guests: '1',
        },
      },
    )
    expect(createRes.status()).toBe(201)
    const { id, cancellationToken } = await createRes.json()

    const cancelRes = await request.post(
      `${tenantBaseURL}/api/public/sites/site-demo/reservations/${id}/cancel`,
      { headers: { Authorization: `Bearer ${cancellationToken}` } },
    )
    expect(cancelRes.status()).toBe(200)

    await new Promise(r => setTimeout(r, 2000))

    const notifRes = await request.get(
      devNotificationsUrl(tenantBaseURL, { site_id: 'site-demo', since }),
    )
    const { notifications } = await notifRes.json() as { notifications: NotificationRow[] }

    const dashboard = notifications.find(n => n.channel === 'dashboard' && n.template === 'reservation_cancelled')
    expect(dashboard).toBeDefined()
    expect(dashboard?.status).toBe('sent')

    const guestCancel = notifications.find(n => n.channel === 'email' && n.template === 'reservation_customer_cancelled')
    expect(guestCancel).toBeDefined()
    expect(guestCancel?.recipient).toBe(guestEmail)
  })
})

test.describe('notification records — experience booking (pottery house)', () => {
  test('experience booking creates dashboard + email notification records', async ({ request }) => {
    const since = new Date().toISOString()
    const guestEmail = `test-booking-${Date.now()}@playwright.example`
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

    const res = await request.post(
      `${potteryHouseBaseURL}/api/public/sites/site-pottery-house/experiences/pottery-wheel-class/book`,
      {
        data: {
          guest_name: 'Playwright Booking Test',
          guest_email: guestEmail,
          party_size: 2,
          booking_date: futureDate,
          time_slot: '10:00',
        },
      },
    )
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.booking_id).toEqual(expect.any(String))

    await new Promise(r => setTimeout(r, 2000))

    const notifRes = await request.get(
      devNotificationsUrl(potteryHouseBaseURL, { site_id: 'site-pottery-house', since }),
    )
    expect(notifRes.status()).toBe(200)
    const { notifications } = await notifRes.json() as { notifications: NotificationRow[] }

    // Dashboard in-app notification (uses new_reservation slot)
    const dashboard = notifications.find(n => n.channel === 'dashboard' && n.template === 'new_reservation')
    expect(dashboard).toBeDefined()
    expect(dashboard?.status).toBe('sent')
    expect(dashboard?.title).toContain('Playwright Booking Test')

    // Owner email
    const ownerEmail = notifications.find(n => n.channel === 'email' && n.template === 'new_reservation')
    expect(ownerEmail).toBeDefined()
    expect(['sent', 'failed']).toContain(ownerEmail?.status)

    // Guest confirmation email
    const guestConfirm = notifications.find(n => n.channel === 'email' && n.template === 'experience_booking_customer_received')
    expect(guestConfirm).toBeDefined()
    expect(guestConfirm?.recipient).toBe(guestEmail)
    expect(['sent', 'failed']).toContain(guestConfirm?.status)
  })

  test('email notification records show correct failure reason when RESEND_API_KEY not configured', async ({ request }) => {
    const since = new Date().toISOString()
    const futureDate = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

    await request.post(
      `${potteryHouseBaseURL}/api/public/sites/site-pottery-house/experiences/pottery-wheel-class/book`,
      {
        data: {
          guest_name: 'Resend Key Test',
          guest_email: `test-resend-${Date.now()}@playwright.example`,
          party_size: 1,
          booking_date: futureDate,
          time_slot: '12:00',
        },
      },
    )

    await new Promise(r => setTimeout(r, 2000))

    const notifRes = await request.get(
      devNotificationsUrl(potteryHouseBaseURL, { site_id: 'site-pottery-house', since }),
    )
    const { notifications } = await notifRes.json() as { notifications: NotificationRow[] }
    const emailNotifs = notifications.filter(n => n.channel === 'email')

    if (emailNotifs.some(n => n.status === 'failed')) {
      // When RESEND_API_KEY is not set, the error must be informative (not a silent crash)
      const failed = emailNotifs.find(n => n.status === 'failed')!
      expect(failed.error).toBeTruthy()
      expect(failed.error).not.toBe('')
    }
    // If RESEND_API_KEY IS configured, emails should be sent — both states are acceptable
  })
})
