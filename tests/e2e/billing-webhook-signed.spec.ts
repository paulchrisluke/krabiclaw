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
  test('queues a valid signed event and is idempotent on replay', async ({ request, baseURL }) => {
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
    await expect.poll(async () => {
      const current = await request.get(
        `${baseURL}/api/dev/billing-state?organization_id=${encodeURIComponent(organizationId!)}&stripe_event_id=${encodeURIComponent(eventId)}`,
        { headers: devLoginHeaders() },
      )
      const body = await current.json() as { webhook_events: Array<{ stripe_event_id: string; status?: string }> }
      return body.webhook_events.find(e => e.stripe_event_id === eventId)?.status
    }, { timeout: 10_000 }).toBe('processed')

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

  test('ignores retired one-time checkout metadata and accepts subscription/setup checkout modes', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(login.status()).toBe(302)
    const contextResponse = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextResponse.status()).toBe(200)
    const contextBody = await contextResponse.json() as { organization?: { id?: string } }
    const organizationId = contextBody.organization?.id
    expect(organizationId).toEqual(expect.any(String))

    const sendSigned = async (event: Record<string, unknown>) => {
      const payload = JSON.stringify(event)
      const signed = await runtimeStripeSignature(request, baseURL!, payload)
      return request.post(`${baseURL}/api/billing/webhook`, {
        headers: {
          'content-type': 'application/json',
          'stripe-signature': signed.signature,
          ...(devLoginHeaders() || {}),
        },
        data: payload,
      })
    }

    const timestamp = Math.floor(Date.now() / 1000)
    const sessionId = `cs_retired_addon_e2e_${Date.now()}`
    const paymentEvent = {
      id: `evt_addon_e2e_${Date.now()}`,
      object: 'event',
      created: timestamp,
      livemode: false,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          object: 'checkout.session',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: `pi_retired_addon_e2e_${Date.now()}`,
          metadata: { organization_id: organizationId, type: 'service_addon', addon_type: 'seasonal' },
        },
      },
    }
    const first = await sendSigned(paymentEvent)
    expect(first.status()).toBe(200)

    const stateUrl = `${baseURL}/api/dev/billing-state?organization_id=${encodeURIComponent(organizationId!)}`
    await expect.poll(async () => {
      const response = await request.get(stateUrl, { headers: devLoginHeaders() })
      const body = await response.json() as { webhook_events: Array<{ stripe_event_id: string; status?: string }> }
      const matchingEvents = body.webhook_events.filter(item => item.stripe_event_id === paymentEvent.id)
      return {
        event: matchingEvents[0]?.status,
        eventCount: matchingEvents.length,
      }
    }, { timeout: 10_000 }).toEqual({ event: 'processed', eventCount: 1 })

    const replay = await sendSigned(paymentEvent)
    expect(replay.status()).toBe(200)
    const replayState = await request.get(stateUrl, { headers: devLoginHeaders() })
    const replayBody = await replayState.json() as { webhook_events: Array<{ stripe_event_id: string; status?: string }> }
    expect(replayBody.webhook_events.filter(item => item.stripe_event_id === paymentEvent.id)).toEqual([
      expect.objectContaining({ stripe_event_id: paymentEvent.id, status: 'processed' }),
    ])

    const modeEventIds: string[] = []
    for (const mode of ['subscription', 'setup']) {
      const eventId = `evt_${mode}_e2e_${Date.now()}`
      modeEventIds.push(eventId)
      const response = await sendSigned({
        id: eventId,
        object: 'event',
        created: timestamp,
        livemode: false,
        type: mode === 'subscription' ? 'checkout.session.async_payment_succeeded' : 'checkout.session.completed',
        data: {
          object: {
            id: `cs_${mode}_e2e_${Date.now()}`,
            object: 'checkout.session',
            mode,
            payment_status: mode === 'subscription' ? 'paid' : 'no_payment_required',
            metadata: {
              organization_id: organizationId,
            },
          },
        },
      })
      expect(response.status()).toBe(200)
    }

    await expect.poll(async () => {
      const response = await request.get(stateUrl, { headers: devLoginHeaders() })
      const body = await response.json() as { webhook_events: Array<{ stripe_event_id: string; status?: string }> }
      return modeEventIds.map(id => body.webhook_events.find(item => item.stripe_event_id === id)?.status)
    }, { timeout: 10_000 }).toEqual(['processed', 'processed'])
  })
})
