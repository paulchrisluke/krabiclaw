import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { buildStripePurchaseValue, buildStripeRefundValue, classifyStripeInvoicePurchase } from '../../server/utils/stripe-ga4.ts'
import { readAnalyticsConsent } from '../../server/utils/ga4-delivery.ts'
import { ga4Items, projectConversionToGa4 } from '../../utils/ga4-projection.ts'

const invoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'in_now', customer: 'cus_1', created: 2_000, status_transitions: { paid_at: 2_000 }, billing_reason: 'subscription_cycle', currency: 'usd',
  amount_paid: 5_243, total_excluding_tax: 4_900, ...overrides,
}) as unknown as Stripe.Invoice
const stripeWithHistory = (prior: Array<Record<string, unknown>>) => ({
  invoices: { list: () => (async function* () { for (const item of prior) yield item })() },
}) as unknown as Stripe
const paid = (id: string, amount: number, paidAt: number) => ({ id, amount_paid: amount, created: 1, status_transitions: { paid_at: paidAt } })

test('every paid subscription invoice is a purchase; returning customers are classified apart from acquisition', async () => {
  // A zero-value trial invoice is not a payment: the first positive charge is the first paid conversion, even as a cycle.
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([paid('in_trial', 0, 1_000)]), invoice()), 'initial_subscription')
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([]), invoice({ billing_reason: 'subscription_create' })), 'initial_subscription')
  const returning = stripeWithHistory([paid('in_old', 4_900, 1_000)])
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'subscription_create' })), 'resubscription')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice()), 'subscription_renewal')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'subscription_update' })), 'plan_change')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'subscription_update' }), null, 'upgrade'), 'upgrade')
  assert.equal(await classifyStripeInvoicePurchase(returning, invoice({ billing_reason: 'manual' })), null)
})

test('first payment is decided by payment time, never creation order, with a deterministic tie', async () => {
  // A was created first but paid later than B: B is the first payment, and A (paid after B) is not.
  const a = invoice({ id: 'in_a', created: 100, status_transitions: { paid_at: 400 } })
  const b = invoice({ id: 'in_b', created: 200, status_transitions: { paid_at: 300 } })
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([paid('in_a', 5_243, 400)]), b), 'initial_subscription')
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([paid('in_b', 5_243, 300)]), a), 'subscription_renewal')
  // Paid at the same instant: exactly one of the two is first.
  const tieLow = invoice({ id: 'in_1', status_transitions: { paid_at: 500 } })
  const tieHigh = invoice({ id: 'in_2', status_transitions: { paid_at: 500 } })
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([paid('in_2', 5_243, 500)]), tieLow), 'initial_subscription')
  assert.equal(await classifyStripeInvoicePurchase(stripeWithHistory([paid('in_1', 5_243, 500)]), tieHigh), 'subscription_renewal')
  // A paid invoice without a payment time is missing state, not a guess.
  await assert.rejects(classifyStripeInvoicePurchase(stripeWithHistory([{ id: 'in_x', amount_paid: 1, created: 1 }]), invoice()), /no paid_at/)
})

test('purchase value excludes tax; items are kept only when they reconcile with it', () => {
  const item = { item_id: 'price_1', item_name: 'Growth', quantity: 1, amount_minor: 4_900 }
  const reconciled = buildStripePurchaseValue(invoice(), [item])
  assert.deepEqual(reconciled, { basis: 'purchase', amount_minor: 4_900, collected_minor: 5_243, currency: 'USD', transaction_id: 'in_now', items: [item] })
  // Items that do not add up to the value (credits, one-off charges) are omitted; no balancing item is invented.
  assert.equal(buildStripePurchaseValue(invoice(), [{ ...item, amount_minor: 5_000 }]).items, undefined)
  assert.equal(buildStripePurchaseValue(invoice(), []).items, undefined)
  assert.throws(() => buildStripePurchaseValue(invoice({ total_excluding_tax: null }), [item]), /total excluding tax/)
})

test('a line total that does not divide by its quantity keeps its exact total', () => {
  // 1,000 minor units across three seats: no rounded unit amount, no throw, quantity x price = the line.
  const [item] = ga4Items([{ item_id: 'p', item_name: 'Seats', quantity: 3, amount_minor: 1_000 }], 'USD')
  assert.equal(item!.quantity, 3)
  assert.ok(Math.abs(item!.price * item!.quantity - 10) < 1e-9)
  const value = { basis: 'purchase' as const, amount_minor: 1_000, collected_minor: 1_000, currency: 'USD', transaction_id: 'in_x', items: [{ item_id: 'p', item_name: 'Seats', quantity: 3, amount_minor: 1_000 }] }
  assert.equal(projectConversionToGa4({ eventName: 'purchase', value }).params.value, 10)
})

test('refunds keep the purchase basis and never substitute the whole original purchase', () => {
  const items = [{ item_id: 'price_1', item_name: 'Growth', quantity: 1, amount_minor: 4_900 }]
  const full = buildStripeRefundValue({ invoice: invoice(), refundAmount: 5_243, currency: 'usd', purchaseItems: items })
  assert.deepEqual([full.amount_minor, full.collected_minor, full.items], [4_900, 5_243, items])
  const partial = buildStripeRefundValue({ invoice: invoice(), refundAmount: 1_000, currency: 'usd', purchaseItems: items })
  assert.deepEqual([partial.amount_minor, partial.collected_minor, partial.items], [Math.round(1_000 * 4_900 / 5_243), 1_000, undefined])
  assert.throws(() => buildStripeRefundValue({ invoice: invoice(), refundAmount: 6_000, currency: 'usd', purchaseItems: null }), /outside invoice/)
})

test('an identifier is not consent: only an accepted analytics purpose counts', () => {
  assert.equal(readAnalyticsConsent('kc_analytics_consent={"kc_analytics":true}'), 'accepted')
  assert.equal(readAnalyticsConsent('kc_analytics_consent={"kc_analytics":false}'), 'rejected')
  const cookie = (value: string) => `a=b; kc_analytics_consent=${encodeURIComponent(value)}; _ga=GA1.1.1.2`
  assert.equal(readAnalyticsConsent(cookie('{"kc_analytics":true}')), 'accepted')
  assert.equal(readAnalyticsConsent(cookie('{"kc_analytics":false}')), 'rejected')
  assert.equal(readAnalyticsConsent('_ga=GA1.1.1.2'), 'absent')
  assert.equal(readAnalyticsConsent(cookie('not json')), 'absent')
})
