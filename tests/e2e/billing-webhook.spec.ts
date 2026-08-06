import { expect, test } from '@playwright/test'

test.describe('Better Auth Stripe webhook guardrails', () => {
  test('rejects missing signature/body as invalid webhook request when secret is configured', async ({ request, baseURL }) => {
    const response = await request.post(`${baseURL}/api/auth/stripe/webhook`, {
      data: {},
    })

    if (response.status() === 503) {
      expect(await response.text()).toContain('STRIPE_WEBHOOK_SECRET')
      return
    }

    expect(response.status()).toBe(400)
    expect(await response.text()).toMatch(/STRIPE_|webhook|signature/i)
  })

  test('rejects invalid signature when webhook secret is configured', async ({ request, baseURL }) => {
    const response = await request.post(`${baseURL}/api/auth/stripe/webhook`, {
      headers: {
        'stripe-signature': 't=0,v1=not-a-real-signature',
      },
      data: { id: 'evt_fake', type: 'checkout.session.completed', data: { object: {} } },
    })

    if (response.status() === 503) {
      expect(await response.text()).toContain('STRIPE_WEBHOOK_SECRET')
      return
    }

    expect(response.status()).toBe(400)
    expect(await response.text()).toMatch(/STRIPE_|webhook|signature/i)
  })
})
