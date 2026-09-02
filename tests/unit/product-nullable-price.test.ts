import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePriceInput } from '../../server/utils/product-management.ts'
import { parseProductExtraction } from '../../server/utils/chowbot-media.ts'
import { formatProductPriceLabel, productPriceNote } from '../../utils/product-money.ts'

test('normalizePriceInput distinguishes missing, explicit null, and a fixed amount', () => {
  assert.throws(() => normalizePriceInput(undefined, 'USD'), /price is required/)
  assert.equal(normalizePriceInput(null, 'USD'), null)
  const price = normalizePriceInput({ amount_minor: 500 }, 'USD')
  assert.equal(price?.amountMinor, 500)
  assert.equal(price?.currency, 'USD')
  assert.throws(() => normalizePriceInput(0 as never, 'USD'), /price must be an object or null/)
})

test('parseProductExtraction accepts null price with an explicit price-note and rejects malformed details', () => {
  const [product] = parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Chef\'s Choice', description: null, price: null, order_url: null,
      details: [{ key: 'price-note', label: 'Price', values: ['Market Price'] }],
    }],
  }, 'USD')
  assert.equal(product.price, null)
  assert.deepEqual(product.details, [{ key: 'price-note', label: 'Price', values: ['Market Price'] }])

  const [fixed] = parseProductExtraction({
    items: [{ category: 'Sushi', name: 'Salmon Roll', description: null, price: { amount_minor: 1200 }, order_url: null, details: [] }],
  }, 'USD')
  assert.deepEqual(fixed.price, { amount_minor: 1200, currency: 'USD', unit: 'item', tax_behavior: 'unspecified', provenance: 'ai-import' })

  assert.throws(() => parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Bad Note', description: null, price: null, order_url: null,
      details: [{ key: 'price_note', label: 'Price', values: ['Market Price'] }],
    }],
  }, 'USD'), (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'PRODUCT_IMPORT_VALIDATION_FAILED')
})

test('formatProductPriceLabel prefers a numeric Price over a stale note, then falls back to the generic label', () => {
  const price = { id: 'p1', organization_id: 'o1', site_id: 's1', location_id: 'l1', product_id: 'pr1', amount_minor: 1500, currency: 'USD' as const, unit: 'item' as const, tax_behavior: 'unspecified' as const, compare_at_amount_minor: null, valid_from: '2026-01-01T00:00:00.000Z', valid_until: null, provenance: 'manual', created_by: 'u1', created_at: '2026-01-01T00:00:00.000Z' }
  const noteDetails = [{ key: 'price-note', label: 'Price', values: ['Market Price'] }]

  assert.equal(productPriceNote(noteDetails), 'Market Price')
  assert.equal(productPriceNote([]), null)
  assert.equal(formatProductPriceLabel({ price, details: noteDetails }), '$15.00')
  assert.equal(formatProductPriceLabel({ price: null, details: noteDetails }), 'Market Price')
  assert.equal(formatProductPriceLabel({ price: null, details: [] }), 'Price on request')
})
