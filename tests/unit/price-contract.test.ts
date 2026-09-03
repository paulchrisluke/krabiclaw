import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCatalogLineItemSnapshot } from '../../server/utils/ordering-catalog.ts'
import type { Product } from '../../server/types/products.ts'
import { isProductAvailableForOrdering } from '../../shared/ordering-catalog.ts'
import {
  assertNonOverlappingPrices,
  formatMinorAmount,
  majorAmountToMinor,
  priceAt,
  replacePrice,
  type Price,
} from '../../shared/prices.ts'

const base: Price = {
  id: 'price-1', organization_id: 'org', site_id: 'site', location_id: 'location', product_id: 'product',
  amount_minor: 1250, currency: 'THB', unit: 'item', tax_behavior: 'unspecified',
  compare_at_amount_minor: null, valid_from: '2026-01-01T00:00:00.000Z', valid_until: null,
  provenance: 'manual', created_by: 'user', created_at: '2026-01-01T00:00:00.000Z',
  provider_mappings: [],
}

test('currency precision converts and formats canonical integer minor amounts', () => {
  assert.equal(majorAmountToMinor('12.50', 'THB'), 1250)
  assert.equal(majorAmountToMinor('1250', 'JPY'), 1250)
  assert.equal(majorAmountToMinor('1250', 'VND'), 1250)
  assert.throws(() => majorAmountToMinor('12.5', 'JPY'), /fraction digits/)
  assert.throws(() => majorAmountToMinor('12.345', 'USD'), /fraction digits/)
  assert.equal(formatMinorAmount(1250, 'THB', 'th-TH'), '฿12.50')
})

test('priceAt selects one active interval and rejects overlapping schedules', () => {
  const future = { ...base, id: 'price-2', amount_minor: 1500, valid_from: '2026-06-01T00:00:00.000Z' }
  const closed = { ...base, valid_until: future.valid_from }
  assert.equal(priceAt([closed, future], '2026-05-01T00:00:00.000Z')?.id, 'price-1')
  assert.equal(priceAt([closed, future], future.valid_from)?.id, 'price-2')
  assert.doesNotThrow(() => assertNonOverlappingPrices([closed, future]))
  assert.throws(() => assertNonOverlappingPrices([base, future]), /overlap/)
})

test('repricing closes the current immutable record and creates a replacement', () => {
  const at = '2026-06-01T00:00:00.000Z'
  const result = replacePrice(base, {
    id: 'price-2', amount_minor: 1500, currency: 'THB', unit: 'person', tax_behavior: 'inclusive',
    compare_at_amount_minor: 1800, valid_from: at, provenance: 'manual', created_by: 'user-2', created_at: at,
  })
  assert.equal(result.closed.valid_until, at)
  assert.equal(result.replacement.product_id, base.product_id)
  assert.equal(result.replacement.amount_minor, 1500)
  assert.equal(base.valid_until, null)

  const product: Product = {
    id: 'product', organization_id: 'org', site_id: 'site', location_id: 'location', product_type: 'standard',
    category: 'Mains', name: 'Curry', slug: 'curry', description: '', price: base, order_url: null,
    is_visible: true, available: true, featured: false, featured_sort_order: 0, sort_order: 0,
    tags: [], details: [], image: null, gallery: [], media: [], social_image: null,
    seo_title: null, seo_description: null, canonical_url: null, robots: null, source: 'manual',
    created_at: at, updated_at: at, created_by: 'user', updated_by: 'user',
    menu_placement: { id: 'placement', location_id: 'location', product_id: 'product', section: 'Mains', sort_order: 0, is_published: true, featured: false, featured_sort_order: 0 },
    channel_availability: [{ id: 'channel', location_id: 'location', product_id: 'product', channel: 'ordering', is_available: true }],
    modifier_groups: [{
      id: 'heat', name: 'Heat', minimum_selections: 1, maximum_selections: 1, sort_order: 0, is_active: true,
      provider_mappings: [],
      options: [{ id: 'hot', modifier_group_id: 'heat', name: 'Hot', price_delta_minor: 100, sort_order: 0, is_active: true, provider_mappings: [] }],
    }],
    provider_mappings: [{ id: 'mapping', resource_type: 'product', resource_id: 'product', provider: 'merchant', provider_account_reference: null, external_id: 'external-product' }],
    inventory: { id: 'inventory', product_id: 'product', authority_id: 'authority', quantity_on_hand: 10, quantity_reserved: 0, available_quantity: 10, revision: 1, source_version: null, valid_until: null, state: 'current', status: 'available', unavailable_reason: null, updated_at: at },
  }
  const snapshot = buildCatalogLineItemSnapshot(product, ['hot'])
  assert.equal(snapshot.product_id, product.id)
  assert.equal(snapshot.price_id, base.id)
  assert.equal(snapshot.unit_amount_minor, base.amount_minor)
  assert.equal(snapshot.modifiers[0]?.modifier_option_name, 'Hot')
  assert.equal(snapshot.product_provider_mappings[0]?.external_id, 'external-product')
  assert.equal(isProductAvailableForOrdering(product), true)
  assert.equal(isProductAvailableForOrdering({ ...product, inventory: null }), false)
  assert.equal(isProductAvailableForOrdering({ ...product, inventory: { ...product.inventory!, status: 'unavailable', unavailable_reason: 'stale' } }), false)
  assert.equal(isProductAvailableForOrdering({ ...product, channel_availability: [{ ...product.channel_availability[0]!, is_available: false }] }), false)
  assert.equal(isProductAvailableForOrdering(product, 11), false)
  assert.throws(() => buildCatalogLineItemSnapshot(product, ['hot'], 11), /sufficient current inventory/)
  assert.throws(() => buildCatalogLineItemSnapshot({ ...product, inventory: null }, ['hot']), /sufficient current inventory/)
})
