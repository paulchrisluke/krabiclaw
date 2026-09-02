import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePriceInput, provenanceForActor } from '../../server/utils/product-management.ts'
import { assertNoPriceNoteContradiction } from '../../server/utils/product-validation.ts'
import { parseProductExtraction } from '../../server/utils/chowbot-media.ts'
import { formatProductPriceLabel, productPriceNote } from '../../utils/product-money.ts'

test('normalizePriceInput distinguishes missing, explicit null, and a fixed amount', () => {
  assert.throws(() => normalizePriceInput(undefined, 'manual'), /price is required/)
  assert.equal(normalizePriceInput(null, 'manual'), null)
  const price = normalizePriceInput({ amount_minor: 500, currency: 'USD', unit: 'item', tax_behavior: 'unspecified' }, 'manual')
  assert.equal(price?.amountMinor, 500)
  assert.equal(price?.currency, 'USD')
  assert.equal(price?.provenance, 'manual')
  assert.throws(() => normalizePriceInput(0 as never, 'manual'), /price must be an object or null/)
})

test('normalizePriceInput rejects an amount without explicit currency, unit, or tax_behavior; assertNoPriceNoteContradiction rejects a fixed Price paired with a price-note', () => {
  assert.throws(() => normalizePriceInput({ amount_minor: 500 } as never, 'manual'), /currency is required/)
  assert.throws(() => normalizePriceInput({ amount_minor: 500, currency: 'USD' } as never, 'manual'), /unit is required/)
  assert.throws(() => normalizePriceInput({ amount_minor: 500, currency: 'USD', unit: 'item' } as never, 'manual'), /tax_behavior is required/)

  const note = [{ key: 'price-note', label: 'Price', values: ['Market Price'] }]
  assert.throws(() => assertNoPriceNoteContradiction(true, note), /price-note.*fixed amount/)
  assert.doesNotThrow(() => assertNoPriceNoteContradiction(false, note))
  assert.doesNotThrow(() => assertNoPriceNoteContradiction(true, []))
  assert.doesNotThrow(() => assertNoPriceNoteContradiction(false, []))
})

test('normalizePriceInput derives provenance from the caller, not from a "provenance" field in the input', () => {
  const price = normalizePriceInput({ amount_minor: 500, currency: 'USD', unit: 'item', tax_behavior: 'unspecified', provenance: 'stripe-webhook' } as never, 'ai-import')
  assert.equal(price?.provenance, 'ai-import')
})

test('provenanceForActor marks only the ai-import actor prefix as ai-import', () => {
  assert.equal(provenanceForActor('ai:user123'), 'ai-import')
  assert.equal(provenanceForActor('user123'), 'manual')
})

test('parseProductExtraction accepts an explicit no-fixed-price note, a fixed amount, and rejects unreadable/malformed states', () => {
  const [product] = parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Chef\'s Choice', description: null, order_url: null,
      price: { kind: 'no-fixed-price', amount_minor: null, note: 'Market Price' },
    }],
  }, 'USD')
  assert.equal(product.price, null)
  assert.deepEqual(product.details, [{ key: 'price-note', label: 'Price', values: ['Market Price'] }])

  const [fixed] = parseProductExtraction({
    items: [{ category: 'Sushi', name: 'Salmon Roll', description: null, order_url: null, price: { kind: 'fixed', amount_minor: 1200, note: null } }],
  }, 'USD')
  // provenance is not set here — it's derived downstream from the actor
  // that createProductsBatch is called with, not from extraction output.
  assert.deepEqual(fixed.price, { amount_minor: 1200, currency: 'USD', unit: 'item', tax_behavior: 'unspecified' })
  assert.deepEqual(fixed.details, [])

  // "unreadable" must never be coerced into a no-fixed-price Product — it's
  // rejected like any other malformed row, which aborts the whole batch.
  assert.throws(() => parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Cropped Price Roll', description: null, order_url: null,
      price: { kind: 'unreadable', amount_minor: null, note: null },
    }],
  }, 'USD'), (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'PRODUCT_IMPORT_VALIDATION_FAILED')

  // A "no-fixed-price" row with an empty/blank note is also rejected — the
  // wording must be real, not a placeholder.
  assert.throws(() => parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Blank Note Roll', description: null, order_url: null,
      price: { kind: 'no-fixed-price', amount_minor: null, note: '   ' },
    }],
  }, 'USD'), (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'PRODUCT_IMPORT_VALIDATION_FAILED')

  // An unrecognized discriminator value is rejected, not silently coerced
  // into any of the three known states.
  assert.throws(() => parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Bad Kind Roll', description: null, order_url: null,
      price: { kind: 'bogus', amount_minor: null, note: null },
    }],
  }, 'USD'), (error: unknown) => (error as { data?: { code?: string } }).data?.code === 'PRODUCT_IMPORT_VALIDATION_FAILED')
})

test('formatProductPriceLabel prefers a numeric Price over a stale note, then returns null rather than synthesizing text', () => {
  const price = { id: 'p1', organization_id: 'o1', site_id: 's1', location_id: 'l1', product_id: 'pr1', amount_minor: 1500, currency: 'USD' as const, unit: 'item' as const, tax_behavior: 'unspecified' as const, compare_at_amount_minor: null, valid_from: '2026-01-01T00:00:00.000Z', valid_until: null, provenance: 'manual', created_by: 'u1', created_at: '2026-01-01T00:00:00.000Z' }
  const noteDetails = [{ key: 'price-note', label: 'Price', values: ['Market Price'] }]

  assert.equal(productPriceNote(noteDetails), 'Market Price')
  assert.equal(productPriceNote([]), null)
  assert.equal(formatProductPriceLabel({ price, details: noteDetails }), '$15.00')
  assert.equal(formatProductPriceLabel({ price: null, details: noteDetails }), 'Market Price')
  // No Price and no explicit note: return null so callers omit the price
  // element entirely rather than render text nobody supplied.
  assert.equal(formatProductPriceLabel({ price: null, details: [] }), null)
})
