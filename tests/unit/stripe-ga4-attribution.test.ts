import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let sentGa4Events = 0

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async () => null,
  },
})

mock.module('../../server/utils/stripe-ga4-intents.ts', {
  namedExports: {
    consumeStripeGa4Intent: async () => undefined,
    findConsumedStripeGa4CancellationIntent: async () => null,
    findPendingInitialStripeGa4Intent: async () => null,
    findPendingStripeGa4Intent: async () => null,
    getPersistedStripeGa4Attribution: async () => ({ clientId: null, userId: null }),
    markStripeGa4IntentLifecycleSent: async () => undefined,
    persistStripeGa4Attribution: async () => undefined,
    attachStripeGa4IntentToSubscription: async () => undefined,
  },
})

mock.module('../../server/utils/stripe-invoice-lines.ts', {
  namedExports: {
    invoiceLineIsProration: () => false,
    invoiceLineIsSubscription: () => true,
    invoiceLinePrice: () => null,
    invoiceLineQuantity: () => 1,
    invoiceLineSubscriptionId: () => null,
    invoiceLineUnitAmount: () => null,
    loadStripeInvoiceLines: async () => [],
  },
})

mock.module('../../server/utils/ga4-measurement-protocol.ts', {
  namedExports: {
    sendGa4Event: async () => {
      sentGa4Events += 1
    },
  },
})

mock.module('../../server/utils/better-auth-stripe.ts', {
  namedExports: {
    invoiceSubscriptionId: (invoice: { subscription?: string | null }) => invoice.subscription ?? null,
  },
})

const { handleStripeGa4Event } = await import('../../server/utils/stripe-ga4.ts')

test('unattributed invoice purchases do not fail billing webhook processing', async () => {
  sentGa4Events = 0

  await handleStripeGa4Event(
    { GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'secret' } as never,
    {} as never,
    {
      customers: {
        retrieve: async () => ({ id: 'cus-1', deleted: false, metadata: {} }),
      },
      subscriptions: {
        retrieve: async () => ({
          id: 'sub-1',
          customer: 'cus-1',
          metadata: { organization_id: 'org-1' },
          items: { data: [] },
        }),
      },
    } as never,
    {
      id: 'evt_invoice_paid_unattributed',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in-1',
          amount_paid: 4900,
          billing_reason: 'subscription_create',
          currency: 'usd',
          subscription: 'sub-1',
        },
      },
    } as never,
  )

  assert.equal(sentGa4Events, 0)
})
