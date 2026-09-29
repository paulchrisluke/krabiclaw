import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { buildStripePurchaseValue, buildStripeRefundValue, classifyStripeInvoicePurchase } from '../../server/utils/stripe-ga4.ts'
import { readAnalyticsConsent } from '../../server/utils/ga4-delivery.ts'

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'in_now', customer: 'cus_1', created: 2_000, billing_reason: 'subscription_cycle', currency: 'usd',
  amount_paid: 5_243, total_excluding_tax: 4_900, ...overrides,
}) as unknown as Stripe.Invoice
const stripeWithHistory = (prior: Array<Record<string, unknown>>) => ({
  invoices: { list: () => (async function* () { for (const item of prior) yield item })() },
}) as unknown as Stripe

test('every paid subscription invoice is a purchase; returning customers are classified apart from acquisition', async () => {
  const paid = (id: string, amount: number, created: number) => ({ id, amount_paid: amount, created })
  // A zero-value trial invoice is not a payment: the first positive charge is the first paid conversion, even as a cycle.
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([paid('in_trial', 0, 1_000)]), invoice()), 'initial_subscription')
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([]), invoice({ billing_reason: 'subscription_create' })), 'initial_subscription')
  const returning = stripeWithHistory([paid('in_old', 4_900, 1_000)])
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'subscription_create' })), 'resubscription')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice()), 'subscription_renewal')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'subscription_update' })), 'plan_change')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'subscription_update' }), null, 'upgrade'), 'upgrade')
  // A later payment is not "earlier" than this one, and this invoice never counts against itself.
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([paid('in_now', 5_243, 2_000), paid('in_later', 5_243, 3_000)]), invoice()), 'initial_subscription')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'manual' })), null)
})

test('purchase value excludes tax while collected cash includes it', () => {
  const item = { item_id: 'price_1', item_name: 'Growth', price_minor: 4_900, quantity: 1 }
  assert.deepEqual(buildStripePurchaseValue(invoice() as Stripe.Invoice, [item]), { basis: 'purchase', amount_minor: 4_900, collected_minor: 5_243, currency: 'USD', transaction_id: 'in_now', items: [item] })
  assert.throws(() => buildStripePurchaseValue(invoice({ total_excluding_tax: null }) as Stripe.Invoice, [item]), /total excluding tax/)
})

test('refunds keep the purchase basis and never substitute the whole original purchase', () => {
  const item = { item_id: 'price_1', item_name: 'Growth', price_minor: 4_900, quantity: 1 }
  const full = buildStripeRefundValue({ invoice: invoice() as Stripe.Invoice, refundAmount: 5_243, currency: 'usd', lineItems: [item] })
  assert.deepEqual([full.amount_minor, full.collected_minor, full.items?.length], [4_900, 5_243, 1])
  const partial = buildStripeRefundValue({ invoice: invoice() as Stripe.Invoice, refundAmount: 1_000, currency: 'usd', lineItems: [item] })
  assert.deepEqual([partial.amount_minor, partial.collected_minor, partial.items], [Math.round(1_000 * 4_900 / 5_243), 1_000, undefined])
  assert.throws(() => buildStripeRefundValue({ invoice: invoice() as Stripe.Invoice, refundAmount: 6_000, currency: 'usd', lineItems: [] }), /outside invoice/)
})

test('an identifier is not consent: only an accepted analytics purpose counts', () => {
  const cookie = (value: string) => `a=b; kc_analytics_consent=${encodeURIComponent(value)}; _ga=GA1.1.1.2`
  assert.equal(readAnalyticsConsent(cookie('{"kc_analytics":true}')), 'accepted')
  assert.equal(readAnalyticsConsent(cookie('{"kc_analytics":false}')), 'rejected')
  assert.equal(readAnalyticsConsent('_ga=GA1.1.1.2'), 'absent')
  assert.equal(readAnalyticsConsent(cookie('not json')), 'absent')
})
