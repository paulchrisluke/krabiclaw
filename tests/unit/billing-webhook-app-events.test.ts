import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let payment: Record<string, unknown> | null = null

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async () => null,
  },
})

mock.module('../../server/utils/site-transfer.ts', {
  namedExports: {
    completePaidSiteTransfer: async () => undefined,
  },
})

mock.module('../../server/utils/better-auth-stripe.ts', {
  namedExports: {
    invoiceSubscriptionId: (invoice: { subscription?: string }) => invoice.subscription ?? null,
    markOrganizationPayment: async (_db: unknown, input: Record<string, unknown>) => {
      payment = input
    },
  },
})

const { handleApplicationStripeEvent } = await import('../../server/utils/billing-webhook-app-events.ts')

test('invoice.paid projects paid coverage through the app billing boundary', async () => {
  payment = null
  await handleApplicationStripeEvent(
    {} as never,
    {} as never,
    {
      id: 'evt_paid_projection',
      created: 1_786_000_000,
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_paid_projection',
          subscription: 'sub_paid_projection',
          period_end: 1_788_220_800,
        },
      },
    } as never,
    {
      findOne: async () => ({ referenceId: 'org-paid', stripeCustomerId: 'cus-paid' }),
    } as never,
  )

  assert.deepEqual(payment, {
    organizationId: 'org-paid',
    customerId: 'cus-paid',
    subscriptionId: 'sub_paid_projection',
    paymentStatus: 'paid',
    eventCreated: 1_786_000_000,
    eventId: 'evt_paid_projection',
    invoiceId: 'in_paid_projection',
    invoicePeriodEnd: '2026-09-01T00:00:00.000Z',
    pastDueSince: null,
  })
})

test('invoice.payment_succeeded is ignored by the app billing boundary', async () => {
  payment = null
  await handleApplicationStripeEvent(
    {} as never,
    {} as never,
    { id: 'evt_legacy_paid', created: 1_786_000_000, type: 'invoice.payment_succeeded', data: { object: { id: 'in_legacy', subscription: 'sub-legacy' } } } as never,
    { findOne: async () => ({ referenceId: 'org-paid', stripeCustomerId: 'cus-paid' }) } as never,
  )
  assert.equal(payment, null)
})
