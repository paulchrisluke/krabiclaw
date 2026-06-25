import { expect, test, type APIRequestContext } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'

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

test.describe('billing webhook signed flow', () => {
  test('accepts valid signed checkout webhook and is idempotent on replay', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const context = await request.get(`${baseURL}/api/dashboard/context`)
    expect(context.status()).toBe(200)
    const contextBody = await context.json() as { organization?: { id?: string }; sites?: Array<{ id: string }> }
    const organizationId = contextBody.organization?.id
    expect(organizationId).toEqual(expect.any(String))
    // handleCheckoutCompleted requires site_id in metadata (real checkout sessions always
    // include it) — without it the handler no-ops entirely and silently skips the billing
    // upsert below, which made this test pass or fail based on unrelated leftover state.
    const siteId = contextBody.sites?.[0]?.id
    expect(siteId).toEqual(expect.any(String))

    const eventId = `evt_e2e_${Date.now()}`
    const now = Math.floor(Date.now() / 1000)
    const customerId = `cus_e2e_${Date.now()}`
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
          customer: customerId,
          metadata: {
            organization_id: organizationId,
            site_id: siteId,
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
    const { signature } = await runtimeStripeSignature(request, baseURL!, payload)

    const first = await request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
        ...(devLoginHeaders() || {}),
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

    const state = await request.get(
      `${baseURL}/api/dev/billing-state?organization_id=${encodeURIComponent(organizationId!)}&stripe_event_id=${encodeURIComponent(eventId)}`,
      { headers: devLoginHeaders() },
    )
    expect(state.status()).toBe(200)
    const stateBody = await state.json() as {
      billing: { plan?: string; stripe_customer_id?: string } | null
      webhook_events: Array<{ stripe_event_id: string }>
      entitlements: Array<{ key: string; value: string }>
    }
    expect(stateBody.webhook_events.some(e => e.stripe_event_id === eventId)).toBe(true)
    expect(stateBody.billing).toBeTruthy()
    expect(stateBody.billing?.plan).toBe('growth')
    // applySiteSubscription upserts organization_billing.stripe_customer_id unconditionally
    // from the event, so with site_id now present in metadata this is deterministic.
    expect(stateBody.billing?.stripe_customer_id).toBe(customerId)
    expect(stateBody.entitlements.some(e => e.key === 'plan' && e.value === 'growth')).toBe(true)

    const replay = await request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
        ...(devLoginHeaders() || {}),
      },
      data: payload,
    })
    expect(replay.status()).toBe(200)
    const replayBody = await replay.json()
    expect(replayBody.received).toBe(true)
    expect(replayBody.duplicate).toBe(true)
  })
})
