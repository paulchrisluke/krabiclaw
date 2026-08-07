import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGa4MeasurementPayload,
  sendGa4Event,
  validateGa4MeasurementPayload,
} from '../../server/utils/ga4-measurement-protocol.ts'
import {
  buildStripeGa4PurchaseEvent,
  buildStripeGa4RefundEvent,
  classifyStripeInvoicePurchase,
  stripeMinorToMajor,
} from '../../server/utils/stripe-ga4.ts'
import type { StripeInvoiceLine } from '../../server/utils/stripe-invoice-lines.ts'
import { classifyStripePlanChange } from '../../shared/stripe-ga4.ts'
import { parseGaClientId, parseGaSessionId } from '../../composables/useAnalytics.ts'

function invoiceLine(overrides: Record<string, unknown> = {}): StripeInvoiceLine {
  return {
    id: 'il_123',
    amount: 1237,
    quantity: 1,
    description: 'Pro monthly',
    type: 'subscription',
    subscription: 'sub_123',
    subscription_item: 'si_123',
    price: {
      id: 'price_pro_monthly',
      nickname: 'Pro Monthly',
      unit_amount: 1237,
      currency: 'usd',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
      product: { id: 'prod_pro', name: 'Pro' },
    },
    period: { start: 1, end: 2 },
    proration: false,
    parent: null,
    ...overrides,
  } as StripeInvoiceLine
}

test('GA4 purchase uses Stripe invoice identity, actual paid value, and item lines', () => {
  const event = buildStripeGa4PurchaseEvent({
    invoiceId: 'in_123',
    amountPaid: 1237,
    currency: 'usd',
    purchaseType: 'upgrade',
    subscriptionId: 'sub_123',
    lines: [invoiceLine()],
  })

  assert.equal(event.name, 'purchase')
  assert.deepEqual(event.params, {
    transaction_id: 'in_123',
    value: 12.37,
    currency: 'USD',
    purchase_type: 'upgrade',
    subscription_id: 'sub_123',
    items: [{
      item_id: 'price_pro_monthly',
      item_name: 'Pro',
      item_category: 'Subscription',
      item_category2: 'monthly',
      price: 12.37,
      quantity: 1,
    }],
  })
})

test('GA4 item builder retains metered invoice lines and zero-decimal currencies', () => {
  const line = invoiceLine({
    amount: 500,
    quantity: 2,
    price: {
      id: 'price_metered',
      unit_amount: 250,
      currency: 'jpy',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' },
      product: { id: 'prod_metered', name: 'Usage' },
    },
  })
  const event = buildStripeGa4PurchaseEvent({
    invoiceId: 'in_jpy',
    amountPaid: 500,
    currency: 'jpy',
    purchaseType: 'subscription_renewal',
    subscriptionId: 'sub_123',
    lines: [line],
  })

  assert.equal(event.params?.value, 500)
  assert.deepEqual(event.params?.items, [{
    item_id: 'price_metered',
    item_name: 'Usage',
    item_category: 'Subscription',
    item_category2: 'monthly',
    item_category3: 'Metered',
    price: 250,
    quantity: 2,
  }])
  assert.equal(stripeMinorToMajor(1237, 'usd'), 12.37)
  assert.equal(stripeMinorToMajor(1237, 'bhd'), 1.237)
})

test('invoice reasons distinguish renewals from interactive changes', () => {
  assert.equal(classifyStripeInvoicePurchase('subscription_create'), 'initial_subscription')
  assert.equal(classifyStripeInvoicePurchase('subscription_cycle'), 'subscription_renewal')
  assert.equal(classifyStripeInvoicePurchase('subscription_update', 'upgrade'), 'upgrade')
  assert.equal(classifyStripeInvoicePurchase('subscription_update', 'downgrade'), 'downgrade')
  assert.equal(classifyStripeInvoicePurchase('subscription_update'), null)
})

test('scheduled downgrade is lifecycle-only while plan rank changes classify correctly', () => {
  assert.equal(classifyStripePlanChange('growth', 'managed', true), 'upgrade')
  assert.equal(classifyStripePlanChange('managed', 'growth', true), 'downgrade')
  assert.equal(classifyStripePlanChange('growth', 'free', true), 'downgrade')
  assert.equal(classifyStripePlanChange('free', 'growth', false), 'initial_subscription')

  const event = buildStripeGa4RefundEvent({
    invoiceId: 'in_123',
    refundId: 're_123',
    amount: 500,
    currency: 'usd',
    subscriptionId: 'sub_123',
    lines: [invoiceLine()],
    purchaseType: 'upgrade',
  })
  assert.equal(event.name, 'refund')
  assert.equal(event.params?.transaction_id, 'in_123')
  assert.equal(event.params?.refund_id, 're_123')
  assert.equal(event.params?.value, 5)
})

test('GA4 session attribution is fresh-only and server fallback is deterministic', async () => {
  const withSession = await buildGa4MeasurementPayload({
    clientId: '123.456',
    userId: 'user_123',
    sessionId: '1760000123',
    sessionCapturedAt: 900,
    event: { name: 'purchase', params: { transaction_id: 'in_1', value: 1, currency: 'USD', items: [{ item_id: 'price_1' }] } },
  }, 1000)
  assert.equal(withSession.events[0]?.params?.session_id, 1760000123)
  assert.equal(withSession.user_id, 'user_123')

  const stale = await buildGa4MeasurementPayload({
    userId: 'user_123',
    sessionId: 1760000123,
    sessionCapturedAt: 1,
    event: { name: 'purchase', params: { transaction_id: 'in_2', value: 1, currency: 'USD', items: [{ item_id: 'price_1' }] } },
  }, 100000)
  assert.equal(stale.events[0]?.params?.session_id, undefined)
  assert.match(stale.client_id, /^server\.[0-9a-f]{32}$/)
  validateGa4MeasurementPayload(withSession)
})

test('GA cookie parsing returns the browser identifiers used by billing metadata', () => {
  assert.equal(parseGaClientId('_ga=GA1.1.123456789.1760000000'), '123456789.1760000000')
  assert.equal(parseGaSessionId('_ga_G-ABC=GS1.1.1760000123.1.0.0.0'), 1760000123)
  assert.equal(parseGaSessionId('_ga=GA1.1.123.456'), null)
})

test('GA4 transport throws on upstream failure so the webhook queue can retry', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 503 })
  try {
    await assert.rejects(
      sendGa4Event(
        { GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'secret' },
        { clientId: '123.456', event: { name: 'subscription_upgrade', params: { subscription_id: 'sub_1' } } },
      ),
      /Measurement Protocol failed.*503/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
