import assert from 'node:assert/strict'
import test from 'node:test'
import { optionalBoolean, validateSiteLocaleInput } from '../../server/utils/site-locales.ts'

test('locale source selection accepts only JSON booleans', () => {
  assert.equal(optionalBoolean(undefined, 'is_source'), undefined)
  assert.equal(optionalBoolean(true, 'is_source'), true)
  assert.equal(optionalBoolean(false, 'is_source'), false)
  assert.throws(() => optionalBoolean('true', 'is_source'), /is_source must be a boolean/)
  assert.throws(() => optionalBoolean(1, 'is_source'), /is_source must be a boolean/)
  assert.throws(() => optionalBoolean(null, 'is_source'), /is_source must be a boolean/)
})

test('REST locale input rejects string and number source flags before persistence', () => {
  assert.throws(() => validateSiteLocaleInput({ locale: 'fr', is_source: 'true' }), /is_source must be a boolean/)
  assert.throws(() => validateSiteLocaleInput({ locale: 'fr', is_source: 1 }), /is_source must be a boolean/)
  assert.deepEqual(validateSiteLocaleInput({ locale: 'fr', is_source: true }), { locale: 'fr', is_source: true })
})
