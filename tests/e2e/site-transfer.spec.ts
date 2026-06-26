import { expect, test, type APIRequestContext } from '@playwright/test'
import { devLoginHeaders, devLoginUrl, testEnv } from './test-env'

const POTTERY_OWNER_USER_ID = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'
const RECIPIENT_USER_ID = 'Nfqw39lwLZ1vejIfYJv24xvD4UKJh8re'
const SITE_ID = 'site-pottery-house'

async function runtimeStripeSignature(
  request: APIRequestContext,
  baseURL: string,
  payload: string,
) {
  const res = await request.post(`${baseURL}/api/dev/stripe-signature`, {
    headers: devLoginHeaders(),
    data: { payload },
  })
  expect(res.status()).toBe(200)
  return res.json() as Promise<{ signature: string }>
}

async function resetTransferFixture(request: APIRequestContext, baseURL: string) {
  const res = await request.post(`${baseURL}/api/dev/site-transfer-reset`, {
    headers: devLoginHeaders(),
    data: {
      siteId: SITE_ID,
      organizationId: 'org-pottery-house',
    },
  })
  expect(res.status()).toBe(200)
}

async function createTransferFixtureSite(request: APIRequestContext, baseURL: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const res = await request.post(`${baseURL}/api/sites`, {
    data: {
      name: `Transfer Fixture ${suffix}`,
      subdomain: `transfer-fixture-${suffix}`,
      vertical: 'experience',
    },
  })
  expect(res.status()).toBe(200)
  const body = await res.json() as { siteId?: string; organizationId?: string }
  expect(body.siteId).toEqual(expect.any(String))
  expect(body.organizationId).toEqual(expect.any(String))
  return {
    siteId: body.siteId as string,
    organizationId: body.organizationId as string,
  }
}

test.describe('site transfer handoff flow', () => {
  test.describe.configure({ mode: 'serial' })

  test('paid handoff stays pending until checkout completes and reminders can be forced', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    test.skip(
      !testEnv('STRIPE_SECRET_KEY') || !testEnv('NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
      'Stripe must be configured for the paid handoff flow test.',
    )

    await resetTransferFixture(request, baseURL!)

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
    const transferFixture = await createTransferFixtureSite(request, baseURL!)

    const cancelExisting = await request.delete(`${baseURL}/api/admin/sites/${transferFixture.siteId}/transfer`)
    expect([200, 404]).toContain(cancelExisting.status())

    const create = await request.post(`${baseURL}/api/admin/sites/${transferFixture.siteId}/transfer`, {
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

    const reminders = await request.post(`${baseURL}/api/dev/site-transfer-reminders`, {
      headers: devLoginHeaders(),
    })
    expect(reminders.status()).toBe(200)

    const notifications = await request.get(
      `${baseURL}/api/dev/notifications?site_id=${encodeURIComponent(transferFixture.siteId)}&template=site_transfer_reminder&since=${encodeURIComponent(since)}`,
      { headers: devLoginHeaders() },
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

    const pendingStateRes = await request.get(
      `${baseURL}/api/dev/site-transfer-state?transfer_id=${encodeURIComponent(created.id)}`,
      { headers: devLoginHeaders() },
    )
    expect(pendingStateRes.status()).toBe(200)
    const pendingState = await pendingStateRes.json() as {
      transfer: { status: string; payment_completed_at: string | null; claiming_organization_id: string | null }
      site: { organization_id: string }
    }
    expect(pendingState.transfer.status).toBe('pending')
    expect(pendingState.transfer.payment_completed_at).toBeNull()
    expect(pendingState.transfer.claiming_organization_id).toBe(targetOrgId)
    expect(pendingState.site.organization_id).toBe(transferFixture.organizationId)

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
            transfer_site_id: transferFixture.siteId,
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
    const { signature } = await runtimeStripeSignature(request, baseURL!, payload)

    const webhook = await request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
        ...(devLoginHeaders() || {}),
      },
      data: payload,
    })
    expect(webhook.status()).toBe(200)

    const completedStateRes = await request.get(
      `${baseURL}/api/dev/site-transfer-state?transfer_id=${encodeURIComponent(created.id)}`,
      { headers: devLoginHeaders() },
    )
    expect(completedStateRes.status()).toBe(200)
    const completedState = await completedStateRes.json() as {
      transfer: { status: string; payment_completed_at: string | null }
      site: { organization_id: string }
    }
    expect(completedState.transfer.status).toBe('accepted')
    expect(completedState.transfer.payment_completed_at).toEqual(expect.any(String))
    expect(completedState.site.organization_id).toBe(targetOrgId)
  })

  test('transfer cancellation keeps site in original org and clears pending state', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await resetTransferFixture(request, baseURL!)

    const adminLogin = await request.get(devLoginUrl(baseURL!, POTTERY_OWNER_USER_ID), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(adminLogin.status()).toBe(302)
    const transferFixture = await createTransferFixtureSite(request, baseURL!)

    // Cancel any leftover pending transfer first
    await request.delete(`${baseURL}/api/admin/sites/${transferFixture.siteId}/transfer`)

    // Initiate a paid transfer (requires_payment=true so domain snapshot is attempted)
    const create = await request.post(`${baseURL}/api/admin/sites/${transferFixture.siteId}/transfer`, {
      data: {
        email: 'cancel-test@e2e.invalid',
        plan: 'growth',
        message: 'Cancellation regression test.',
      },
    })
    expect(create.status()).toBe(200)
    const created = await create.json() as { id: string; requires_payment: boolean }
    expect(created.id).toEqual(expect.any(String))
    expect(created.requires_payment).toBe(true)

    // The transfer record must have a custom_domains_snapshot field (string or null — either is fine,
    // but the field must be present to prove the snapshot code path ran)
    const pendingStateRes = await request.get(
      `${baseURL}/api/dev/site-transfer-state?transfer_id=${encodeURIComponent(created.id)}`,
      { headers: devLoginHeaders() },
    )
    expect(pendingStateRes.status()).toBe(200)
    const pendingState = await pendingStateRes.json() as {
      transfer: { status: string; custom_domains_snapshot: string | null }
      site: { organization_id: string }
    }
    expect(pendingState.transfer.status).toBe('pending')
    expect('custom_domains_snapshot' in pendingState.transfer).toBe(true)
    // Site ownership must not have changed yet
    expect(pendingState.site.organization_id).toBe(transferFixture.organizationId)

    // Cancel the transfer
    const cancelRes = await request.delete(`${baseURL}/api/admin/sites/${transferFixture.siteId}/transfer`)
    expect(cancelRes.status()).toBe(200)
    const cancelBody = await cancelRes.json() as { cancelled: boolean }
    expect(cancelBody.cancelled).toBe(true)

    // Transfer must now be cancelled and site must still belong to the original org
    const cancelledStateRes = await request.get(
      `${baseURL}/api/dev/site-transfer-state?transfer_id=${encodeURIComponent(created.id)}`,
      { headers: devLoginHeaders() },
    )
    expect(cancelledStateRes.status()).toBe(200)
    const cancelledState = await cancelledStateRes.json() as {
      transfer: { status: string }
      site: { organization_id: string }
    }
    expect(cancelledState.transfer.status).toBe('cancelled')
    expect(cancelledState.site.organization_id).toBe(transferFixture.organizationId)
  })
})
