import assert from 'node:assert/strict'
import test from 'node:test'
import { assertExactCanonicalLocale, canonicalizeLocale } from '../../server/utils/localization.ts'
import { validateLocalizedRoutePath, validateLocalizedValues } from '../../server/utils/localization-registry.ts'

test('locale identifiers must already be exact canonical BCP 47 tags', () => {
  assert.equal(canonicalizeLocale('fr'), 'fr')
  assert.equal(canonicalizeLocale('zh-Hant'), 'zh-Hant')
  assert.equal(canonicalizeLocale('FR'), 'fr')
  assert.throws(() => assertExactCanonicalLocale('FR'), /canonical/i)
  assert.throws(() => assertExactCanonicalLocale(' fr '), /canonical/i)
})

test('localized resource payloads reject partial and unknown fields', () => {
  assert.deepEqual(validateLocalizedValues('product', { category: 'Entrées', name: 'Curry' }), { category: 'Entrées', name: 'Curry' })
  assert.throws(() => validateLocalizedValues('product', { name: 'Curry' }), /Missing required localized field/i)
  assert.throws(() => validateLocalizedValues('product', { category: 'Entrées', name: 'Curry', price: '$5' }), /Unknown localized field/i)
})

test('localized route families are exact and locale-prefixed', () => {
  assert.equal(validateLocalizedRoutePath('experience', 'fr', '/fr/experiences/kayak', 'experience'), '/fr/experiences/kayak')
  assert.throws(() => validateLocalizedRoutePath('experience', 'fr', '/experiences/kayak', 'experience'), /invalid/i)
  assert.throws(() => validateLocalizedRoutePath('site', 'fr', '/fr', 'experience'), /does not accept route_path/i)
})
