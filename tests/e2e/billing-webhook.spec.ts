import { expect, test } from '@playwright/test'

test.describe('billing webhook guardrails', () => {
  test('rejects missing signature/body as invalid webhook request when secret is configured', async ({ request, baseURL }) => {
    const response = await request.post(`${baseURL}/api/billing/webhook`, {
      data: {},
    })

    if (response.status() === 503) {
      const body = await response.json()
      expect(String(body.error || '')).toContain('Stripe webhook secret not configured')
      return
    }

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(String(body.error || '')).toContain('Invalid webhook request')
  })

  test('rejects invalid signature when webhook secret is configured', async ({ request, baseURL }) => {
    const response = await request.post(`${baseURL}/api/billing/webhook`, {
      headers: {
        'stripe-signature': 't=0,v1=not-a-real-signature',
      },
      data: { id: 'evt_fake', type: 'checkout.session.completed', data: { object: {} } },
    })

    if (response.status() === 503) {
      const body = await response.json()
      expect(String(body.error || '')).toContain('Stripe webhook secret not configured')
      return
    }

    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(String(body.error || '')).toContain('Invalid webhook signature')
  })
})
