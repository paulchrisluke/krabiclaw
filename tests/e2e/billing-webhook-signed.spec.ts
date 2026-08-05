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
  test('accepts a valid signed event and is idempotent on replay', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const context = await request.get(`${baseURL}/api/dashboard/context`)
    expect(context.status()).toBe(200)
    const contextBody = await context.json() as { organization?: { id?: string }; sites?: Array<{ id: string }> }
    const organizationId = contextBody.organization?.id
    expect(organizationId).toEqual(expect.any(String))
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
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: `in_e2e_${Date.now()}`,
          object: 'invoice',
          customer: customerId,
          subscription: null,
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
    expect(firstBody.success).toBe(true)

    const state = await request.get(
      `${baseURL}/api/dev/billing-state?organization_id=${encodeURIComponent(organizationId!)}&stripe_event_id=${encodeURIComponent(eventId)}`,
      { headers: devLoginHeaders() },
    )
    expect(state.status()).toBe(200)
    const stateBody = await state.json() as {
      webhook_events: Array<{ stripe_event_id: string; status?: string }>
    }
    expect(stateBody.webhook_events.some(e => e.stripe_event_id === eventId)).toBe(true)
    expect(stateBody.webhook_events.find(e => e.stripe_event_id === eventId)?.status).toBe('processed')

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
    expect(replayBody.success).toBe(true)
  })
})
