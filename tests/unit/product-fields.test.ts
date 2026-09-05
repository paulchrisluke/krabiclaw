import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fromProductDetailDrafts, normalizeProductTags, toProductDetailDrafts } from '../../utils/product-fields.ts'
import { PRODUCT_DETAIL_KEY, PRODUCT_LIMITS } from '../../shared/product-limits.ts'

test('the price note never reaches the detail editor in either direction', () => {
  const drafts = toProductDetailDrafts([
    { key: 'price-note', label: 'Price', values: ['Market price'] },
    { key: 'allergens', label: 'Allergens', values: ['Peanuts'] },
  ])
  assert.deepEqual(drafts.map(draft => draft.key), ['allergens'])

  // Typing a label that derives to the reserved key must not produce one
  // either, or the server rejects the whole save as a duplicate key.
  const details = fromProductDetailDrafts([{ key: null, label: 'Price note', values: ['Ask us'] }])
  assert.equal(details.length, 1)
  assert.notEqual(details[0]!.key, 'price-note')
})

test('an existing group keeps its saved key when its label is renamed', () => {
  const details = fromProductDetailDrafts([
    { key: 'allergens', label: 'Allergen information', values: ['Peanuts'] },
  ])
  assert.deepEqual(details, [{ key: 'allergens', label: 'Allergen information', values: ['Peanuts'] }])
})

test('a new group derives a kebab-case key the server accepts', () => {
  const details = fromProductDetailDrafts([
    { key: null, label: '  Spice Level!! ', values: ['Hot'] },
    { key: null, label: 'Crème brûlée', values: ['Yes'] },
  ])
  assert.deepEqual(details.map(detail => detail.key), ['spice-level', 'creme-brulee'])
  for (const detail of details) assert.ok(PRODUCT_DETAIL_KEY.test(detail.key))
})

test('two groups that derive the same key are separated rather than colliding', () => {
  const details = fromProductDetailDrafts([
    { key: null, label: 'Allergens', values: ['Peanuts'] },
    { key: null, label: 'allergens!', values: ['Shellfish'] },
  ])
  assert.deepEqual(details.map(detail => detail.key), ['allergens', 'allergens-2'])
})

test('groups the server would reject are dropped instead of sent', () => {
  const details = fromProductDetailDrafts([
    { key: null, label: '   ', values: ['Orphaned'] },
    { key: null, label: 'No values', values: ['', '  '] },
    { key: null, label: 'Kept', values: ['Peanuts', 'peanuts', 'Shellfish'] },
  ])
  // Blank label and value-less groups are gone; the survivor is de-duplicated
  // ignoring case, which is the rule the server applies.
  assert.deepEqual(details, [{ key: 'kept', label: 'Kept', values: ['Peanuts', 'Shellfish'] }])
})

test('tags are de-duplicated ignoring case before they are sent', () => {
  // The server rejects the whole save on a case-only duplicate, so the first
  // spelling wins here rather than the tenant losing their edit to a 400.
  assert.deepEqual(normalizeProductTags([' Vegan ', 'vegan', 'Spicy', '']), ['Vegan', 'Spicy'])
})

test('the group cap is applied by the form, not left for the server to reject', () => {
  const drafts = Array.from({ length: PRODUCT_LIMITS.detailGroups + 5 }, (_, index) => ({
    key: null,
    label: `Group ${index}`,
    values: ['value'],
  }))
  assert.equal(fromProductDetailDrafts(drafts).length, PRODUCT_LIMITS.detailGroups)
})
