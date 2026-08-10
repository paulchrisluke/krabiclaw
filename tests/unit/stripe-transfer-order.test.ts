import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const calls: string[] = []
let receivedStripe: unknown = null
let receivedPlans: unknown = null

mock.module('../../server/utils/better-auth-stripe.ts', {
  namedExports: {
    recordStripeEvent: async (_db: unknown, _event: unknown, work: () => Promise<void>) => {
      calls.push('record')
      await work()
      calls.push('record-complete')
      return true
    },
    reconcileBetterAuthSubscriptionEvent: async (_db: unknown, event: { type: string }) => {
      assert.equal(event.type, 'checkout.session.completed')
      calls.push('reconcile')
    },
  },
})

mock.module('../../server/utils/billing-webhook-app-events.ts', {
  namedExports: {
    handleApplicationStripeEvent: async (_env: unknown, _db: unknown, _event: unknown, _adapter: unknown, stripe: unknown, plans: unknown) => {
      receivedStripe = stripe
      receivedPlans = plans
      calls.push('application-transfer')
    },
  },
})

mock.module('../../server/utils/stripe-ga4.ts', {
  namedExports: {
    handleStripeGa4Event: async () => {
      calls.push('ga4')
    },
  },
})

const { processStripeEvent } = await import('../../server/utils/stripe-event-processing.ts?stripe-transfer-order')

test('site-transfer checkout reconciliation completes before application transfer fulfillment', async () => {
  calls.length = 0
  receivedStripe = null
  receivedPlans = null
  const stripe = { marker: 'stripe' }
  const plans = async () => []
  await processStripeEvent(
    {} as never,
    {} as never,
    {
      id: 'evt-transfer-order',
      type: 'checkout.session.completed',
      data: { object: { metadata: { type: 'site_transfer' } } },
    } as never,
    stripe as never,
    {} as never,
    plans as never,
  )

  assert.deepEqual(calls, ['record', 'reconcile', 'application-transfer', 'ga4', 'record-complete'])
  assert.equal(receivedStripe, stripe)
  assert.equal(receivedPlans, plans)
})
