import test from 'node:test'
import assert from 'node:assert/strict'

import { parsePhone, isValidE164, formatForDisplay, parsePhoneOrThrow, PHONE_METADATA_VERSION } from '../../utils/phone.ts'

test('parsePhone: US number with country code', () => {
  const result = parsePhone('+1 415 555 2671')
  assert.equal(result.valid, true)
  assert.equal(result.possible, true)
  assert.equal(result.e164, '+14155552671')
  assert.equal(result.country, 'US')
})

test('parsePhone: Thai number using defaultCountry fallback', () => {
  const result = parsePhone('081 234 5678', { defaultCountry: 'TH' })
  assert.equal(result.valid, true)
  assert.equal(result.e164, '+66812345678')
  assert.equal(result.country, 'TH')
})

test('parsePhone: Thai number already in E.164 form', () => {
  const result = parsePhone('+66 81 234 5678')
  assert.equal(result.valid, true)
  assert.equal(result.e164, '+66812345678')
  assert.equal(result.country, 'TH')
})

test('parsePhone: GB number with country code', () => {
  const result = parsePhone('+44 20 7946 0958')
  assert.equal(result.valid, true)
  assert.equal(result.e164, '+442079460958')
  assert.equal(result.country, 'GB')
})

test('parsePhone: clearly invalid input never throws and returns an empty result', () => {
  const result = parsePhone('not a phone number')
  assert.equal(result.valid, false)
  assert.equal(result.e164, null)
  assert.equal(result.country, null)
  assert.equal(result.raw, 'not a phone number')
})

test('parsePhone: empty input returns an empty, non-throwing result', () => {
  const result = parsePhone('')
  assert.equal(result.valid, false)
  assert.equal(result.possible, false)
  assert.equal(result.e164, null)
})

test('isValidE164: valid vs invalid numbers', () => {
  assert.equal(isValidE164('+14155552671'), true)
  assert.equal(isValidE164('+66812345678'), true)
  assert.equal(isValidE164('12345'), false)
  assert.equal(isValidE164('not a phone number'), false)
})

test('parsePhoneOrThrow: returns E.164 for a valid number, throws for an invalid one', () => {
  assert.equal(parsePhoneOrThrow('081 234 5678', { defaultCountry: 'TH' }), '+66812345678')
  assert.throws(() => parsePhoneOrThrow('not a phone number'), /Invalid phone number/)
})

test('formatForDisplay: masks all but country code and trailing digits', () => {
  const display = formatForDisplay('+66812345678')
  assert.match(display, /^\+66 /)
  assert.match(display, /5678$/)
  assert.doesNotMatch(display, /8123/)
})

test('formatForDisplay: falls back to the input when it does not parse', () => {
  assert.equal(formatForDisplay('not-a-number'), 'not-a-number')
})

test('PHONE_METADATA_VERSION is a non-empty identifying string', () => {
  assert.equal(typeof PHONE_METADATA_VERSION, 'string')
  assert.match(PHONE_METADATA_VERSION, /libphonenumber-js/)
})
