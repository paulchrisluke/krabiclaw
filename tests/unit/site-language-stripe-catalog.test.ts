import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCatalogPlan } from '../../scripts/lib/stripe-catalog-plan.mjs'

test('catalog planning provisions one site-language product with exact monthly and annual prices', () => {
  const plan = buildCatalogPlan({
    snapshot: { accountId: 'acct_test', accountMode: 'test', products: [], pricesByProduct: {} },
  })
  const product = plan.operations.find(operation => operation.type === 'create_product' && operation.planId === 'site_language')
  assert.equal(product?.params.metadata.product_family, 'site_language')
  assert.equal(product?.params.metadata.plan_id, undefined)
  const prices = plan.operations.filter(operation => operation.type === 'create_price' && operation.product?.ref?.planId === 'site_language')
  assert.deepEqual(prices.map(operation => [operation.params.recurring.interval, operation.params.unit_amount]), [
    ['month', 500],
    ['year', 6000],
  ])
})

test('catalog planning rejects a site-language price with the wrong amount', () => {
  const product = {
    id: 'prod_language', active: true, name: 'Site Language', description: 'One manually localized language for one Growth site.',
    marketing_features: [], metadata: { product_family: 'site_language' }, default_price: 'price_bad', images: [],
  }
  assert.throws(() => buildCatalogPlan({
    snapshot: {
      accountId: 'acct_test', accountMode: 'test', products: [product],
      pricesByProduct: { prod_language: [{ id: 'price_bad', active: true, currency: 'usd', unit_amount: 501, recurring: { interval: 'month', interval_count: 1 }, lookup_key: null, product: 'prod_language' }] },
    },
  }), /must be usd 500 cents/)
})
