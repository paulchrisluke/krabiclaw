import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let payment: Record<string, unknown> | null = null
let projection: Record<string, unknown> | null = null
let invoiceLines: Array<Record<string, unknown>> = []
let transferRow: Record<string, unknown> | null = null
let completedTransferId: string | null = null
let transferResolvedPlan = 'growth'
let transferBaseQuantity: number | undefined = 1

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | null> => {
      if (query.includes('FROM site_transfer_requests')) return transferRow as T | null
      return null
    },
  },
})

mock.module('../../server/utils/site-transfer.ts', {
  namedExports: {
    isTransferClaimSentinel: (value: string | null | undefined) => typeof value === 'string' && value.startsWith('claim:'),
    completePaidSiteTransfer: async (_env: unknown, _db: unknown, transferId: string) => {
      completedTransferId = transferId
    },
  },
})

mock.module('../../server/utils/better-auth-stripe.ts', {
  namedExports: {
    invoiceSubscriptionId: (invoice: { subscription?: string }) => invoice.subscription ?? null,
    markOrganizationPayment: async (_db: unknown, input: Record<string, unknown>) => {
      payment = input
    },
    projectOrganizationSubscription: async (_db: unknown, input: Record<string, unknown>) => {
      projection = input
    },
    resolveCanonicalSubscriptionPlan: async (_stripe: unknown, subscription: { id?: string }) => subscription.id === 'sub_transfer_paid'
      ? {
          item: {
            id: 'si_transfer',
            price: {
              id: transferResolvedPlan === 'growth' ? 'price_growth_month' : 'price_other_month',
              recurring: { interval: 'month', interval_count: 1 },
            },
            quantity: transferBaseQuantity,
          },
          plan: { name: transferResolvedPlan },
        }
      : {
          item: {
            id: 'si_growth',
            price: { id: 'price_growth_month' },
            current_period_start: 1_788_220_800,
            current_period_end: 1_790_899_200,
          },
          plan: { name: 'growth' },
        },
  },
})

mock.module('../../server/utils/stripe-invoice-lines.ts', {
  namedExports: {
    invoiceLinePrice: (line: { price?: string | { id: string } | null }) => line.price ?? null,
    invoiceLineSubscriptionId: (line: { subscription?: string | null }) => line.subscription ?? null,
    invoiceLineSubscriptionItemId: (line: { subscription_item?: string | null }) => line.subscription_item ?? null,
    loadStripeInvoiceLines: async () => invoiceLines,
  },
})

const { handleApplicationStripeEvent } = await import('../../server/utils/billing-webhook-app-events.ts')

function stripeDouble() {
  return {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_paid_projection',
        status: 'active',
        items: { data: [] },
      }),
    },
  } as never
}

function invoiceEvent(type: string) {
  return {
    id: type === 'invoice.paid' ? 'evt_paid_projection' : `evt_${type.replaceAll('.', '_')}`,
    created: 1_786_000_000,
    type,
    data: {
      object: {
        id: 'in_paid_projection',
        subscription: 'sub_paid_projection',
        period_end: 1_788_220_800,
      },
    },
  } as never
}

function baseInvoiceLine() {
  return {
    id: 'il_base',
    subscription: 'sub_paid_projection',
    subscription_item: 'si_growth',
    price: 'price_growth_month',
    period: { start: 1_788_220_800, end: 1_790_899_200 },
  }
}

function loadPlans() {
  return (async () => [{ name: 'growth', priceId: 'price_growth_month' }]) as never
}

function paidAdapter() {
  return {
    findOne: async () => ({ referenceId: 'org-paid', stripeCustomerId: 'cus-paid', plan: 'growth', status: 'active' }),
  } as never
}

test('invoice.paid writes the exact base price/period and reprojects Growth access', async () => {
  payment = null
  projection = null
  invoiceLines = [baseInvoiceLine()]
  await handleApplicationStripeEvent({}, {} as never, invoiceEvent('invoice.paid'), paidAdapter(), stripeDouble(), loadPlans())

  assert.deepEqual(payment, {
    organizationId: 'org-paid',
    customerId: 'cus-paid',
    subscriptionId: 'sub_paid_projection',
    paymentStatus: 'paid',
    eventCreated: 1_786_000_000,
    eventId: 'evt_paid_projection',
    invoiceId: 'in_paid_projection',
    basePlanPriceId: 'price_growth_month',
    invoicePeriodStart: '2026-09-01T00:00:00.000Z',
    invoicePeriodEnd: '2026-10-02T00:00:00.000Z',
    pastDueSince: null,
  })
  assert.deepEqual(projection, {
    organizationId: 'org-paid',
    customerId: 'cus-paid',
    subscriptionId: 'sub_paid_projection',
    plan: 'growth',
    status: 'active',
    periodEnd: new Date('2026-10-02T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
  })
})

test('base invoice failure reprojects access after payment ledger update', async () => {
  payment = null
  projection = null
  invoiceLines = [baseInvoiceLine()]
  await handleApplicationStripeEvent({}, {} as never, invoiceEvent('invoice.payment_failed'), paidAdapter(), stripeDouble(), loadPlans())

  assert.equal(payment?.paymentStatus, 'failed')
  assert.equal(payment?.basePlanPriceId, 'price_growth_month')
  assert.equal(projection?.plan, 'growth')
  assert.equal(projection?.status, 'active')
})

for (const eventType of ['invoice.paid', 'invoice.payment_failed']) {
  test(`seat-only ${eventType} neither grants nor revokes plan coverage`, async () => {
    payment = null
    projection = null
    invoiceLines = [{
      ...baseInvoiceLine(),
      id: 'il_seat',
      subscription_item: 'si_seat',
      price: 'price_seat',
    }]
    await handleApplicationStripeEvent({}, {} as never, invoiceEvent(eventType), paidAdapter(), stripeDouble(), loadPlans())
    assert.equal(payment, null)
    assert.equal(projection, null)
  })
}

test('invoice.payment_succeeded is ignored by the app billing boundary', async () => {
  payment = null
  await handleApplicationStripeEvent(
    {} as never,
    {} as never,
    { id: 'evt_legacy_paid', created: 1_786_000_000, type: 'invoice.payment_succeeded', data: { object: { id: 'in_legacy', subscription: 'sub-legacy' } } } as never,
    { findOne: async () => ({ referenceId: 'org-paid', stripeCustomerId: 'cus-paid' }) } as never,
    {} as never,
    loadPlans(),
  )
  assert.equal(payment, null)
})

function transferCheckoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_transfer_paid',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_transfer_paid',
        status: 'complete',
        mode: 'subscription',
        client_reference_id: 'org-recipient',
        customer: 'cus-transfer',
        payment_status: 'paid',
        subscription: 'sub_transfer_paid',
        metadata: {
          type: 'site_transfer',
          referenceId: 'org-recipient',
          organization_id: 'org-recipient',
          plan: 'growth',
          transfer_request_id: 'transfer-paid',
          transfer_site_id: 'site-transferred',
          transfer_claiming_user_id: 'user-recipient',
          transfer_claiming_organization_id: 'org-recipient',
        },
        ...overrides,
      },
    },
  } as never
}

function transferStripe(customer = 'cus-transfer') {
  return {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_transfer_paid',
        customer,
        status: 'active',
        items: { data: [] },
      }),
    },
  } as never
}

function transferAdapter(overrides: Record<string, unknown> = {}) {
  return {
    findOne: async (input: { where?: Array<{ field: string; value: unknown }> }) => {
      if (input.where?.[0]?.field !== 'stripeSubscriptionId' || input.where?.[0]?.value !== 'sub_transfer_paid') return null
      return {
        referenceId: 'org-recipient',
        stripeCustomerId: 'cus-transfer',
        plan: 'growth',
        stripeSubscriptionId: 'sub_transfer_paid',
        ...overrides,
      }
    },
  } as never
}

function validTransferRow() {
  return {
    id: 'transfer-paid',
    site_id: 'site-transferred',
    status: 'pending',
    invited_plan: 'growth',
    requires_payment: 1,
    stripe_checkout_session_id: 'cs_transfer_paid',
    claiming_user_id: 'user-recipient',
    claiming_organization_id: 'org-recipient',
    payment_completed_at: null,
  }
}

test('site-transfer fulfillment is bound to the stored checkout and claim projection', async () => {
  transferRow = validTransferRow()
  completedTransferId = null

  await handleApplicationStripeEvent(
    {} as never,
    {} as never,
    transferCheckoutEvent(),
    transferAdapter(),
    transferStripe(),
    loadPlans(),
  )

  assert.equal(completedTransferId, 'transfer-paid')
})

test('site-transfer fulfillment rejects a checkout that is not the stored session', async () => {
  transferRow = validTransferRow()
  completedTransferId = null

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent({ id: 'cs_other' }),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /not the stored session/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment rejects non-subscription checkout evidence', async () => {
  transferRow = validTransferRow()
  completedTransferId = null

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent({ mode: 'payment', subscription: null }),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /subscription-mode evidence/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment requires a complete real paid Checkout session', async () => {
  transferRow = validTransferRow()
  completedTransferId = null

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent({ status: 'open' }),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /is not complete/,
  )
  await handleApplicationStripeEvent(
    {} as never,
    {} as never,
    transferCheckoutEvent({ payment_status: 'unpaid' }),
    transferAdapter(),
    transferStripe(),
    loadPlans(),
  )
  assert.equal(completedTransferId, null)

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent({ id: 'claim:reserved' }),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /not a real Checkout session/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment rejects site, plan, organization, and claimant mismatches', async () => {
  const mismatches: Array<{ label: string; row: Record<string, unknown>; session?: Record<string, unknown>; expected: RegExp }> = [
    { label: 'site', row: { ...validTransferRow(), site_id: 'site-other' }, expected: /Checkout site does not match/ },
    { label: 'plan', row: { ...validTransferRow(), invited_plan: 'starter' }, expected: /Checkout plan does not match/ },
    { label: 'organization', row: { ...validTransferRow(), claiming_organization_id: 'org-other' }, expected: /Checkout organization does not match/ },
    { label: 'claimant', row: { ...validTransferRow(), claiming_user_id: 'user-other' }, expected: /Checkout claimant does not match/ },
  ]

  for (const mismatch of mismatches) {
    transferRow = mismatch.row
    completedTransferId = null
    await assert.rejects(
      () => handleApplicationStripeEvent(
        {} as never,
        {} as never,
        transferCheckoutEvent(mismatch.session),
        transferAdapter(),
        transferStripe(),
        loadPlans(),
      ),
      mismatch.expected,
      mismatch.label,
    )
    assert.equal(completedTransferId, null)
  }
})

test('site-transfer fulfillment requires the canonical Stripe plan to match the invited plan', async () => {
  transferRow = validTransferRow()
  transferResolvedPlan = 'managed'

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent(),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /subscription plan does not match site transfer/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment requires exactly one canonical base quantity', async () => {
  transferRow = validTransferRow()

  for (const quantity of [2, undefined] as const) {
    transferBaseQuantity = quantity
    await assert.rejects(
      () => handleApplicationStripeEvent(
        {} as never,
        {} as never,
        transferCheckoutEvent(),
        transferAdapter(),
        transferStripe(),
        loadPlans(),
      ),
      /invalid canonical base quantity/,
      `quantity ${String(quantity)}`,
    )
    assert.equal(completedTransferId, null)
  }
})

test('site-transfer fulfillment requires Checkout and Stripe subscription customers to match', async () => {
  transferRow = validTransferRow()

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent({ customer: 'cus-other' }),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /customer does not match subscription/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment requires exact Better Auth subscription evidence', async () => {
  transferRow = validTransferRow()

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent(),
      { findOne: async () => null } as never,
      transferStripe(),
      loadPlans(),
    ),
    /Better Auth subscription .* was not found/,
  )

  for (const [field, value] of [
    ['referenceId', 'org-other'],
    ['stripeCustomerId', 'cus-other'],
    ['plan', 'managed'],
    ['stripeSubscriptionId', 'sub-other'],
  ] as const) {
    await assert.rejects(
      () => handleApplicationStripeEvent(
        {} as never,
        {} as never,
        transferCheckoutEvent(),
        transferAdapter({ [field]: value }),
        transferStripe(),
        loadPlans(),
      ),
      /Better Auth subscription .* does not match site transfer/,
      field,
    )
  }
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment rejects a cancelled transfer before completion', async () => {
  transferRow = { ...validTransferRow(), status: 'cancelled' }
  completedTransferId = null

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent(),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /is cancelled/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment rejects a claim sentinel instead of treating it as a checkout session', async () => {
  transferRow = { ...validTransferRow(), stripe_checkout_session_id: 'claim:reserved' }
  completedTransferId = null

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent(),
      transferAdapter(),
      transferStripe(),
      loadPlans(),
    ),
    /claim reservation/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment rejects a mismatched client reference or metadata reference', async () => {
  transferRow = validTransferRow()
  completedTransferId = null

  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent({ client_reference_id: 'org-other' }),
      { findOne: async () => null } as never,
      {} as never,
      loadPlans(),
    ),
    /reference does not match/,
  )
  await assert.rejects(
    () => handleApplicationStripeEvent(
      {} as never,
      {} as never,
      transferCheckoutEvent({
        metadata: {
          type: 'site_transfer',
          referenceId: 'org-other',
          organization_id: 'org-recipient',
          plan: 'growth',
          transfer_request_id: 'transfer-paid',
          transfer_site_id: 'site-transferred',
          transfer_claiming_user_id: 'user-recipient',
          transfer_claiming_organization_id: 'org-recipient',
        },
      }),
      { findOne: async () => null } as never,
      {} as never,
      loadPlans(),
    ),
    /reference does not match/,
  )
  assert.equal(completedTransferId, null)
})

test('site-transfer fulfillment allows an accepted transfer retry for the exact completed Checkout session', async () => {
  transferRow = { ...validTransferRow(), status: 'accepted' }
  completedTransferId = null

  await handleApplicationStripeEvent(
    {} as never,
    {} as never,
    transferCheckoutEvent(),
    transferAdapter(),
    transferStripe(),
    loadPlans(),
  )

  assert.equal(completedTransferId, 'transfer-paid')
})

test.afterEach(() => {
  transferRow = null
  completedTransferId = null
  invoiceLines = []
  transferResolvedPlan = 'growth'
  transferBaseQuantity = 1
})
