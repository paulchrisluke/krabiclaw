import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { assertStripeCatalogPrices, selectStripeCatalogPrice } from '../../server/utils/stripe-catalog.ts'
import { PRICING_COMPARISON, comparisonValue } from '../../shared/pricing-comparison.ts'
import { getPlanEntitlements } from '../../server/utils/billing-entitlements.ts'
import { classifyStripePlanChange } from '../../shared/stripe-ga4.ts'
import { renderPlansMarkdown } from '../../server/routes/pricing.md.get.ts'
import type { Plan } from '../../server/utils/billing-plans.ts'

const product = { id: 'prod-existing', metadata: { plan_id: 'growth', monthly_price_id: 'price-month', annual_price_id: 'price-year' } } as unknown as Stripe.Product
const price = (id: string, interval: 'month' | 'year', amount: number) => ({
  id, product: product.id, active: true, unit_amount: amount, currency: 'usd', recurring: { interval, interval_count: 1 }, lookup_key: null,
}) as Stripe.Price
const monthly = price('price-month', 'month', 4900)
const annual = price('price-year', 'year', 58800)

test('pricing resolves exact provider interval identities, never derives annual from monthly', () => {
  assert.equal(selectStripeCatalogPrice(product, [monthly, annual], 'month')?.id, 'price-month')
  assert.equal(selectStripeCatalogPrice(product, [monthly, annual], 'year')?.id, 'price-year')
  assert.equal(selectStripeCatalogPrice(product, [monthly], 'year'), null)
  assert.equal(selectStripeCatalogPrice(product, [annual], 'month'), null)
  assertStripeCatalogPrices('growth', monthly, annual)
})

test('missing, wrong-currency and fabricated zero paid prices cannot become the current offer', () => {
  assert.throws(() => assertStripeCatalogPrices('growth', null), /monthly price/)
  assert.throws(() => assertStripeCatalogPrices('growth', { ...monthly, currency: 'eur' }), /monthly price/)
  assert.throws(() => assertStripeCatalogPrices('growth', { ...monthly, unit_amount: 0 }), /monthly price/)
  assert.throws(() => assertStripeCatalogPrices('growth', monthly, { ...annual, unit_amount: 4900 }), /annual price/)
  assert.equal(selectStripeCatalogPrice(product, [{ ...monthly, unit_amount: 0 }], 'month'), null)
})

test('Commerce requires the approved USD 89 monthly offer and rejects an invented annual offer', () => {
  const commerce = price('price-commerce-month', 'month', 8900)
  assertStripeCatalogPrices('commerce', commerce)
  for (const amount of [0, 4900, 9900, 14900]) {
    assert.throws(() => assertStripeCatalogPrices('commerce', { ...commerce, unit_amount: amount }), /monthly price/)
  }
  assert.throws(() => assertStripeCatalogPrices('commerce', { ...commerce, currency: 'eur' }), /monthly price/)
  assert.throws(() => assertStripeCatalogPrices('commerce', commerce, price('price-commerce-year', 'year', 106800)), /no authorized annual price/)
  assert.throws(() => assertStripeCatalogPrices('invented_plan', commerce), /Unknown paid plan/)
})

test('Commerce inherits Growth capabilities and participates in native subscription transitions', () => {
  const growth = getPlanEntitlements('growth')
  const commerce = getPlanEntitlements('commerce')
  for (const [capability, value] of Object.entries(growth)) {
    if (capability !== 'plan' && capability !== 'payments') assert.equal(commerce[capability], value)
  }
  assert.equal(getPlanEntitlements('free').payments, false)
  assert.equal(growth.payments, false)
  assert.equal(commerce.payments, true)
  assert.equal(classifyStripePlanChange('free', 'commerce', false), 'initial_subscription')
  assert.equal(classifyStripePlanChange('growth', 'commerce', true), 'upgrade')
  assert.equal(classifyStripePlanChange('commerce', 'growth', true), 'downgrade')
  assert.equal(classifyStripePlanChange('commerce', 'commerce', true), null)
})

test('display rename preserves provider identities and metadata selects one canonical offer', () => {
  const renamed = { ...product, name: 'Grow' }
  assert.equal(selectStripeCatalogPrice(renamed, [monthly, annual], 'month')?.id, monthly.id)
  assert.equal(selectStripeCatalogPrice(renamed, [monthly, annual], 'year')?.id, annual.id)
  const ambiguous = { ...product, metadata: { plan_id: 'growth' } }
  assert.throws(() => selectStripeCatalogPrice(ambiguous, [monthly, price('price-other', 'month', 4900)], 'month'), /exactly one canonical/)
})

test('comparison rejects unknown capabilities and preserves current review-request policy', () => {
  assert.throws(() => comparisonValue({ entitlement: 'invented_capability' }, 'growth'), /Unknown capability/)
  assert.throws(() => comparisonValue({ entitlement: 'messaging' }, 'invented_plan'), /Unsupported runtime billing plan/)
  const review = PRICING_COMPARISON.flatMap(group => [...group.rows]).find(row => row.id === 'reviews.requests')!
  assert.equal(comparisonValue(review, 'free'), 'Not included')
  assert.equal(comparisonValue(review, 'growth'), 'Included')
  assert.equal(comparisonValue(review, 'commerce'), 'Included')
  const payments = PRICING_COMPARISON.flatMap(group => [...group.rows]).find(row => row.id === 'payments.acceptance')!
  assert.equal(comparisonValue(payments, 'free'), 'Not included')
  assert.equal(comparisonValue(payments, 'growth'), 'Not included')
  assert.equal(comparisonValue(payments, 'commerce'), 'Included')
  const onboarding = PRICING_COMPARISON.flatMap(group => [...group.rows]).find(row => row.id === 'places.onboarding')!
  assert.equal(comparisonValue(onboarding, 'free'), 'Included')
})

test('renderPlansMarkdown generates accurate, machine-readable markdown specifications', () => {
  const dummyPlans: Plan[] = [
    {
      id: 'free',
      name: 'Free',
      tagline: 'Start building for free',
      highlighted: false,
      prices: [],
      features: ['Basic templates', 'AI site generation'],
      limits: { customDomain: false, googlePlaces: false, support: 'Community' },
      cta: { label: 'Start Free', href: '/signup' },
    },
    {
      id: 'growth',
      name: 'Growth',
      tagline: 'Scale your business',
      highlighted: true,
      prices: [{ id: 'p_month', amount: 4900, currency: 'usd', interval: 'month' }],
      features: ['Custom domains', 'Google Places', 'Direct booking'],
      limits: { customDomain: true, googlePlaces: true, support: 'Priority' },
      cta: { label: 'Upgrade', href: '/signup' },
    },
  ]

  const md = renderPlansMarkdown(dummyPlans)
  assert.ok(md.includes('# Krabiclaw Pricing & Plans'))
  assert.ok(md.includes('## Free'))
  assert.ok(md.includes('Free ($0/month)'))
  assert.ok(md.includes('## Growth'))
  assert.ok(md.includes('$49/month'))
  assert.ok(md.includes('Custom Domain: Included'))
  assert.ok(md.includes('Custom Domain: Not included'))
})
