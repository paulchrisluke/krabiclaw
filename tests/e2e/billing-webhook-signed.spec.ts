import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { devLoginHeaders, devLoginUrl, testEnv } from './test-env'

function stripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${payload}`
  const digest = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return `t=${timestamp},v1=${digest}`
}

test.describe('billing webhook signed flow', () => {
  test('accepts valid signed checkout webhook and is idempotent on replay', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const context = await request.get(`${baseURL}/api/dashboard/context`)
    expect(context.status()).toBe(200)
    const contextBody = await context.json() as { organization?: { id?: string } }
    const organizationId = contextBody.organization?.id
    expect(organizationId).toEqual(expect.any(String))

    const webhookSecret = testEnv('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) {
      const response = await request.post(`${baseURL}/api/billing/webhook`, {
        data: {},
      })
      expect(response.status()).toBe(503)
      const body = await response.json()
      expect(String(body.error || '')).toContain('Stripe webhook secret not configured')
      return
    }

    const eventId = `evt_e2e_${Date.now()}`
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
          id: `cs_e2e_${Date.now()}`,
          object: 'checkout.session',
          customer: `cus_e2e_${Date.now()}`,
          metadata: {
            organization_id: organizationId,
            plan: 'growth',
          },
          subscription: {
            id: `sub_e2e_${Date.now()}`,
            items: { data: [{ id: `si_e2e_${Date.now()}` }] },
            billing_cycle_anchor: now + 86400,
          },
        },
      },
    })
    const signature = stripeSignature(payload, webhookSecret)

    const first = await request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      data: payload,
    })

    // If Stripe secret key is missing locally, endpoint returns explicit 503 after signature verification.
    if (first.status() === 503) {
      const body = await first.json()
      expect(String(body.error || '')).toContain('Stripe secret key not configured')
      return
    }

    expect(first.status()).toBe(200)
    const firstBody = await first.json()
    expect(firstBody.received).toBe(true)

    const state = await request.get(`${baseURL}/api/dev/billing-state?organization_id=${encodeURIComponent(organizationId!)}&stripe_event_id=${encodeURIComponent(eventId)}`)
    expect(state.status()).toBe(200)
    const stateBody = await state.json() as {
      billing: { plan?: string; stripe_customer_id?: string } | null
      webhook_events: Array<{ stripe_event_id: string }>
      entitlements: Array<{ key: string; value: string }>
    }
    expect(stateBody.webhook_events.some(e => e.stripe_event_id === eventId)).toBe(true)
    expect(stateBody.billing).toBeTruthy()
    expect(stateBody.billing?.plan).toBe('growth')
    expect(String(stateBody.billing?.stripe_customer_id || '')).toContain('cus_e2e_')
    expect(stateBody.entitlements.some(e => e.key === 'plan' && e.value === 'growth')).toBe(true)

    const replay = await request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      data: payload,
    })
    expect(replay.status()).toBe(200)
    const replayBody = await replay.json()
    expect(replayBody.received).toBe(true)
    expect(replayBody.duplicate).toBe(true)
  })
})
