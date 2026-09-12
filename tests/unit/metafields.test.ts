import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MetafieldError,
  assertMetafieldDefinition,
  isMetafieldLocalizable,
  metafieldHandle,
  parseMetafieldValue,
  serializeMetafieldValue,
  validateMetafieldValue,
  type MetafieldDefinition,
  type MetafieldValueType,
  type MetafieldValidations,
} from '../../shared/metafields.ts'

function define(
  key: string,
  value_type: MetafieldValueType,
  validations: MetafieldValidations = {},
  localizable = true,
): MetafieldDefinition {
  return {
    id: `md-${key}`, organization_id: 'org', namespace: 'menu', key,
    name: key, description: null, value_type, validations, localizable,
  }
}

// Every descriptive attribute carried in production on 2026-09-11: the six
// details_json keys and the four prose/list fields extracted from
// experience_json. Each is a definition, not a column.
const PRODUCTION_ATTRIBUTES: [string, MetafieldValueType][] = [
  ['allergens', 'list.single_line_text'],
  ['sizes', 'list.single_line_text'],
  ['noodle', 'list.single_line_text'],
  ['soup', 'list.single_line_text'],
  ['toppings', 'list.single_line_text'],
  ['price-note', 'list.single_line_text'],
  ['included-items', 'list.single_line_text'],
  ['what-to-bring', 'list.single_line_text'],
  ['meeting-point', 'multi_line_text'],
  ['cancellation-policy', 'multi_line_text'],
]

test('the ten production attributes are definitions, and an eleventh needs only one more', () => {
  for (const [key, type] of PRODUCTION_ATTRIBUTES) assertMetafieldDefinition(define(key, type))
  assert.equal(PRODUCTION_ATTRIBUTES.length, 10)

  // The acceptance test: an eleventh attribute of a supported type is a
  // definition and a value. Nothing else in this file, or anywhere, changes.
  const eleventh = define('spice-level', 'integer', { min: 0, max: 5 }, false)
  assertMetafieldDefinition(eleventh)
  assert.equal(validateMetafieldValue(eleventh, 3), 3)
  assert.throws(() => validateMetafieldValue(eleventh, 9), MetafieldError)
  assert.equal(metafieldHandle(eleventh), 'menu.spice-level')
})

test('inclusions and preparation instructions stay distinct attributes', () => {
  const included = define('included-items', 'list.single_line_text')
  const bring = define('what-to-bring', 'list.single_line_text')
  assert.notEqual(metafieldHandle(included), metafieldHandle(bring))
  assert.deepEqual(validateMetafieldValue(included, ['Clay', 'Apron']), ['Clay', 'Apron'])
  assert.deepEqual(validateMetafieldValue(bring, ['Towel']), ['Towel'])
})

test('text values', () => {
  const single = define('tagline', 'single_line_text', { max_length: 10 })
  assert.equal(validateMetafieldValue(single, 'Short'), 'Short')
  assert.throws(() => validateMetafieldValue(single, 'way too long to fit'), /at most 10/)
  assert.throws(() => validateMetafieldValue(single, 'two\nlines'), /single line/)
  assert.throws(() => validateMetafieldValue(single, '   '), /must not be blank/)
  assert.throws(() => validateMetafieldValue(single, 5), /must be a string/)

  const multi = define('meeting-point', 'multi_line_text')
  assert.equal(validateMetafieldValue(multi, 'Gate 3\nBy the fountain'), 'Gate 3\nBy the fountain')
})

test('choices close the set', () => {
  const spice = define('heat', 'single_line_text', { choices: ['mild', 'hot'] })
  assert.equal(validateMetafieldValue(spice, 'hot'), 'hot')
  assert.throws(() => validateMetafieldValue(spice, 'nuclear'), /must be one of/)
})

test('lists reject duplicates, overflow and blanks', () => {
  const allergens = define('allergens', 'list.single_line_text', { max_items: 2 })
  assert.deepEqual(validateMetafieldValue(allergens, ['Peanuts', 'Shellfish']), ['Peanuts', 'Shellfish'])
  assert.throws(() => validateMetafieldValue(allergens, ['Peanuts', 'Peanuts']), /distinct/)
  assert.throws(() => validateMetafieldValue(allergens, ['a', 'b', 'c']), /at most 2/)
  assert.throws(() => validateMetafieldValue(allergens, ['Peanuts', '']), /must not be blank/)
  assert.throws(() => validateMetafieldValue(allergens, 'Peanuts'), /must be a list/)
})

test('url values are https and carry no credentials', () => {
  const url = define('booking-info', 'url', {}, false)
  assert.equal(validateMetafieldValue(url, 'https://example.test/x'), 'https://example.test/x')
  assert.throws(() => validateMetafieldValue(url, 'http://example.test'), /https/)
  assert.throws(() => validateMetafieldValue(url, 'https://u:p@example.test'), /credentials/)
  assert.throws(() => validateMetafieldValue(url, 'not-a-url'), /absolute URL/)
})

test('definitions reject malformed shapes', () => {
  assert.throws(() => assertMetafieldDefinition(define('Allergens', 'single_line_text')), /key must match/)
  assert.throws(() => assertMetafieldDefinition({ ...define('a', 'single_line_text'), namespace: 'Menu' }), /namespace must match/)
  assert.throws(() => assertMetafieldDefinition({ ...define('a', 'single_line_text'), name: '  ' }), /must not be blank/)
  assert.throws(() => assertMetafieldDefinition(define('a', 'nope' as MetafieldValueType)), /unsupported value_type/)
  assert.throws(() => assertMetafieldDefinition(define('a', 'integer', { max_items: 2 }, false)), /max_items applies only/)
  assert.throws(() => assertMetafieldDefinition(define('a', 'single_line_text', { min: 1 })), /min and max apply only/)
  assert.throws(() => assertMetafieldDefinition(define('a', 'integer', { min: 5, max: 1 }, false)), /must not be below min/)
  assert.throws(() => assertMetafieldDefinition(define('a', 'single_line_text', { choices: [] })), /must not be empty/)
  assert.throws(() => assertMetafieldDefinition(define('a', 'single_line_text', { choices: ['x', 'x'] })), /distinct/)
})

test('localization eligibility comes from the definition, not a name list', () => {
  assert.equal(isMetafieldLocalizable(define('allergens', 'list.single_line_text', {}, true)), true)
  assert.equal(isMetafieldLocalizable(define('allergens', 'list.single_line_text', {}, false)), false)
  // A number has nothing to translate, so the definition cannot claim it does.
  assert.throws(() => assertMetafieldDefinition(define('spice-level', 'integer', {}, true)), /not translatable/)
  assert.equal(isMetafieldLocalizable(define('spice-level', 'integer', {}, false)), false)
})

test('storage round-trips a typed list without collapsing it to a string', () => {
  const allergens = define('allergens', 'list.single_line_text')
  const stored = serializeMetafieldValue(allergens, ['Peanuts', 'Shellfish'])
  assert.equal(stored, '["Peanuts","Shellfish"]')
  assert.deepEqual(parseMetafieldValue(allergens, stored), ['Peanuts', 'Shellfish'])
  assert.throws(() => parseMetafieldValue(allergens, 'Peanuts'), /not valid JSON/)
  assert.throws(() => parseMetafieldValue(allergens, '"Peanuts"'), /must be a list/)
})
