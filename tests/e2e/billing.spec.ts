import { expect, test } from '@playwright/test'

test.describe('billing contracts', () => {
  test('plans endpoint returns Stripe-backed plans or explicit not-configured error', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/billing/plans`)

    if (response.status() === 503) {
      const body = await response.json()
      expect(body.statusCode).toBe(503)
      expect(String(body.message || '')).toContain('Billing not configured')
      return
    }

    expect(response.status()).toBe(200)
    const plans = await response.json()
    expect(Array.isArray(plans)).toBe(true)
    expect(plans.length).toBeGreaterThan(0)

    const starter = plans.find((plan: { id: string }) => plan.id === 'free')
    expect(starter).toBeDefined()
    expect(starter.name).toBe('Starter')
    expect(starter.prices).toEqual([])
  })
})
