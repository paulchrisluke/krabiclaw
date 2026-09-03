import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertNonOverlappingPrices,
  formatMinorAmount,
  isIsoInstant,
  majorAmountToMinor,
  priceAt,
  replacePrice,
  type Price,
  type PriceInput,
} from '../../shared/prices.ts'
import { parseProductExtraction } from '../../server/utils/chowbot-media.ts'
import { normalizePriceInput } from '../../server/utils/product-management.ts'

const base: Price = {
  id: 'price-1', organization_id: 'org', site_id: 'site', location_id: 'location', product_id: 'product',
  amount_minor: 1250, currency: 'THB', unit: 'item', tax_behavior: 'unspecified',
  compare_at_amount_minor: null, valid_from: '2026-01-01T00:00:00.000Z', valid_until: null,
  provenance: 'manual', created_by: 'user', created_at: '2026-01-01T00:00:00.000Z',
}

test('currency precision converts and formats canonical integer minor amounts', () => {
  assert.equal(majorAmountToMinor('12.50', 'THB'), 1250)
  assert.equal(majorAmountToMinor('1250', 'JPY'), 1250)
  assert.equal(majorAmountToMinor('1250', 'VND'), 1250)
  assert.throws(() => majorAmountToMinor('12.5', 'JPY'), /fraction digits/)
  assert.throws(() => majorAmountToMinor('12.345', 'USD'), /fraction digits/)
  assert.equal(formatMinorAmount(1250, 'THB', 'th-TH'), '฿12.50')
})

test('Product price normalization distinguishes no price from a complete fixed price', () => {
  assert.throws(() => normalizePriceInput(undefined, 'THB', 'manual'), /price is required/)
  assert.equal(normalizePriceInput(null, 'THB', 'manual'), null)
  assert.deepEqual(
    normalizePriceInput({
      amount_minor: 500,
      currency: 'USD',
      unit: 'item',
      tax_behavior: 'unspecified',
      valid_from: '2026-06-01T00:00:00.000Z',
    }, 'THB', 'manual'),
    {
      amountMinor: 500,
      currency: 'USD',
      unit: 'item',
      taxBehavior: 'unspecified',
      compareAt: null,
      validFrom: '2026-06-01T00:00:00.000Z',
      validUntil: null,
      provenance: 'manual',
      validFromProvided: true,
      validUntilProvided: false,
    },
  )
  const defaulted = normalizePriceInput({ amount_minor: 500 }, 'THB', 'manual')
  assert.ok(defaulted)
  assert.equal(defaulted.amountMinor, 500)
  assert.equal(defaulted.currency, 'THB')
  assert.equal(defaulted.unit, 'item')
  assert.equal(defaulted.taxBehavior, 'unspecified')
  assert.equal(defaulted.provenance, 'manual')
  assert.equal(defaulted.validFromProvided, false)
  assert.equal(isIsoInstant(defaulted.validFrom), true)
  assert.throws(
    () => normalizePriceInput({ amount_minor: 500, provenance: 'caller' }, 'THB', 'manual'),
    /assigned by the server/,
  )
  assert.throws(
    () => normalizePriceInput({ amount_minor: 500, currency: null } as unknown as PriceInput, 'THB', 'manual'),
    /currency must be a supported currency/,
  )
})

test('Product media extraction preserves canonical no-price details and rejects unreadable prices', () => {
  const details = [{ key: 'price-note', label: 'Price', values: ['Market Price'] }]
  const [extracted] = parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Chef\'s Choice', description: null, order_url: null,
      price: { kind: 'no-fixed-price', note: 'Market Price' }, details: [],
    }],
  }, 'THB')
  assert.equal(extracted?.price, null)
  assert.deepEqual(extracted?.details, details)
  assert.throws(() => parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Cropped Price Roll', description: null, order_url: null,
      price: { kind: 'unreadable' }, details: [],
    }],
  }, 'THB'), /complete Product import batch was rejected/)
  const [fixed] = parseProductExtraction({
    items: [{
      category: 'Sushi', name: 'Site Currency Roll', description: null, order_url: null,
      price: { kind: 'fixed', amount_minor: 1200 }, details: [],
    }],
  }, 'THB')
  assert.deepEqual(fixed?.price, {
    amount_minor: 1200,
    currency: 'THB',
    unit: 'item',
    tax_behavior: 'unspecified',
  })
})

test('priceAt selects one active interval and rejects overlapping schedules', () => {
  assert.equal(isIsoInstant('2026-02-28T12:34:56Z'), true)
  assert.equal(isIsoInstant('2026-02-28T12:34:56.789Z'), true)
  assert.equal(isIsoInstant('2026-02-30T12:34:56Z'), false)
  assert.equal(isIsoInstant('2026-04-31T12:34:56.000Z'), false)
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
})
