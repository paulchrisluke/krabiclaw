import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { assertGrowthStripeCatalogPrices, selectStripeCatalogPrice } from '../../server/utils/stripe-catalog.ts'

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
  assertGrowthStripeCatalogPrices(monthly, annual)
})

test('missing, wrong-currency and fabricated zero paid prices cannot become the current offer', () => {
  assert.throws(() => assertGrowthStripeCatalogPrices(null), /monthly price/)
  assert.throws(() => assertGrowthStripeCatalogPrices({ ...monthly, currency: 'eur' }), /monthly price/)
  assert.throws(() => assertGrowthStripeCatalogPrices({ ...monthly, unit_amount: 0 }), /monthly price/)
  assert.throws(() => assertGrowthStripeCatalogPrices(monthly, { ...annual, unit_amount: 4900 }), /annual price/)
  assert.equal(selectStripeCatalogPrice(product, [{ ...monthly, unit_amount: 0 }], 'month'), null)
})

test('display rename preserves provider identities and metadata selects one canonical offer', () => {
  const renamed = { ...product, name: 'Grow' }
  assert.equal(selectStripeCatalogPrice(renamed, [monthly, annual], 'month')?.id, monthly.id)
  assert.equal(selectStripeCatalogPrice(renamed, [monthly, annual], 'year')?.id, annual.id)
  const ambiguous = { ...product, metadata: { plan_id: 'growth' } }
  assert.throws(() => selectStripeCatalogPrice(ambiguous, [monthly, price('price-other', 'month', 4900)], 'month'), /exactly one canonical/)
})

import { PRICING_COMPARISON, comparisonValue } from '../../shared/pricing-comparison.ts'
import { normalizeTenantPageBlocks } from '../../utils/tenant-page-blocks.ts'

test('comparison rejects unknown capabilities and preserves current review-request policy', () => {
  assert.throws(() => comparisonValue({ entitlement: 'invented_capability' }, 'growth'), /Unknown capability/)
  assert.throws(() => comparisonValue({ entitlement: 'messaging' }, 'invented_plan'), /Unsupported runtime billing plan/)
  const review = PRICING_COMPARISON.flatMap(group => [...group.rows]).find(row => row.id === 'reviews.requests')!
  assert.equal(comparisonValue(review, 'free'), 'Not included')
  assert.equal(comparisonValue(review, 'growth'), 'Included with setup')
  const onboarding = PRICING_COMPARISON.flatMap(group => [...group.rows]).find(row => row.id === 'places.onboarding')!
  assert.equal(comparisonValue(onboarding, 'free'), 'Included')
})

test('capability comparison is a canonical feature-grid source, not a parallel page or invented block type', () => {
  const [block] = normalizeTenantPageBlocks([{ id: 'comparison-block', type: 'feature_grid', position: 5, data: { source: 'billing_features', title: 'Compare the details.' }, media: [] }])
  assert.equal(block!.type, 'feature_grid')
  assert.equal(block!.data.source, 'billing_features')
})
