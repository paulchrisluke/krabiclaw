import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { devLoginHeaders, devLoginUrl, testEnv } from './test-env'

const POTTERY_OWNER_USER_ID = 'user-pottery-house'
const RECIPIENT_USER_ID = 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re'
const SITE_ID = 'site-pottery-house'

function stripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${payload}`
  const digest = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return `t=${timestamp},v1=${digest}`
}

test.describe('site transfer handoff flow', () => {
  test('paid handoff stays pending until checkout completes and reminders can be forced', async ({ request, baseURL }) => {
    test.skip(
      !testEnv('STRIPE_SECRET_KEY') || !testEnv('STRIPE_WEBHOOK_SECRET') || !testEnv('NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
      'Stripe must be configured for the paid handoff flow test.',
    )

    const since = new Date().toISOString()

    const recipientLogin = await request.get(devLoginUrl(baseURL!, RECIPIENT_USER_ID), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(recipientLogin.status()).toBe(302)

    const recipientSession = await request.get(`${baseURL}/api/auth/get-session`)
    expect(recipientSession.status()).toBe(200)
    const recipientSessionBody = await recipientSession.json() as { user?: { email?: string } }
    const recipientEmail = recipientSessionBody.user?.email
    expect(recipientEmail).toEqual(expect.any(String))

    const adminLogin = await request.get(devLoginUrl(baseURL!, POTTERY_OWNER_USER_ID), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(adminLogin.status()).toBe(302)

    const cancelExisting = await request.delete(`${baseURL}/api/admin/sites/${SITE_ID}/transfer`)
    expect([200, 404]).toContain(cancelExisting.status())

    const create = await request.post(`${baseURL}/api/admin/sites/${SITE_ID}/transfer`, {
      data: {
        email: recipientEmail,
        plan: 'growth',
        message: 'Your studio site is ready to claim.',
      },
    })
    expect(create.status()).toBe(200)
    const created = await create.json() as { id: string; token: string; requires_payment: boolean }
    expect(created.id).toEqual(expect.any(String))
    expect(created.token).toEqual(expect.any(String))
    expect(created.requires_payment).toBe(true)

    const reminders = await request.post(`${baseURL}/api/dev/site-transfer-reminders`)
    expect(reminders.status()).toBe(200)

    const notifications = await request.get(
      `${baseURL}/api/dev/notifications?site_id=${encodeURIComponent(SITE_ID)}&template=site_transfer_reminder&since=${encodeURIComponent(since)}`,
    )
    expect(notifications.status()).toBe(200)
    const notificationsBody = await notifications.json() as { notifications: Array<{ template: string }> }
    expect(notificationsBody.notifications.some((row) => row.template === 'site_transfer_reminder')).toBe(true)

    const demoLogin = await request.get(devLoginUrl(baseURL!, RECIPIENT_USER_ID), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(demoLogin.status()).toBe(302)

    const demoContext = await request.get(`${baseURL}/api/dashboard/context`)
    expect(demoContext.status()).toBe(200)
    const demoContextBody = await demoContext.json() as { organization?: { id?: string } }
    const targetOrgId = demoContextBody.organization?.id
    expect(targetOrgId).toEqual(expect.any(String))

    const accept = await request.post(`${baseURL}/api/site-transfer/${created.token}/accept`)
    expect(accept.status()).toBe(200)
    const acceptBody = await accept.json() as { checkout_url?: string | null }
    expect(String(acceptBody.checkout_url || '')).toContain('http')

    const pendingStateRes = await request.get(`${baseURL}/api/dev/site-transfer-state?transfer_id=${encodeURIComponent(created.id)}`)
    expect(pendingStateRes.status()).toBe(200)
    const pendingState = await pendingStateRes.json() as {
      transfer: { status: string; payment_completed_at: string | null; claiming_organization_id: string | null }
      site: { organization_id: string }
    }
    expect(pendingState.transfer.status).toBe('pending')
    expect(pendingState.transfer.payment_completed_at).toBeNull()
    expect(pendingState.transfer.claiming_organization_id).toBe(targetOrgId)
    expect(pendingState.site.organization_id).toBe('org-pottery-house')

    const webhookSecret = testEnv('STRIPE_WEBHOOK_SECRET')

    const eventId = `evt_transfer_${Date.now()}`
    const now = Math.floor(Date.now() / 1000)
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      api_version: '2025-04-30.basil',
      created: now,
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_transfer_${Date.now()}`,
          object: 'checkout.session',
          customer: `cus_transfer_${Date.now()}`,
          metadata: {
            type: 'site_transfer',
            organization_id: targetOrgId,
            plan: 'growth',
            transfer_request_id: created.id,
            transfer_site_id: SITE_ID,
            transfer_claiming_user_id: RECIPIENT_USER_ID,
            transfer_claiming_organization_id: targetOrgId,
          },
          subscription: {
            id: `sub_transfer_${Date.now()}`,
            items: { data: [{ id: `si_transfer_${Date.now()}` }] },
            billing_cycle_anchor: now + 86400,
          },
        },
      },
    })
    const signature = stripeSignature(payload, webhookSecret)

    const webhook = await request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      data: payload,
    })
    expect(webhook.status()).toBe(200)

    const completedStateRes = await request.get(`${baseURL}/api/dev/site-transfer-state?transfer_id=${encodeURIComponent(created.id)}`)
    expect(completedStateRes.status()).toBe(200)
    const completedState = await completedStateRes.json() as {
      transfer: { status: string; payment_completed_at: string | null }
      site: { organization_id: string }
    }
    expect(completedState.transfer.status).toBe('accepted')
    expect(completedState.transfer.payment_completed_at).toEqual(expect.any(String))
    expect(completedState.site.organization_id).toBe(targetOrgId)
  })
})
