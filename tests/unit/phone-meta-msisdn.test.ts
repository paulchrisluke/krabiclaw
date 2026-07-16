import test from 'node:test'
import assert from 'node:assert/strict'

import { parseMetaMsisdn } from '../../utils/phone.ts'

// Meta's webhook `from`/`recipient_id` fields are always a full international MSISDN
// with no leading "+" (e.g. "14155552671" for a US number, "66812345678" for a Thai
// number) — never a Thai-local format. Parsing this through a `defaultCountry: 'TH'`
// fallback (the convention used elsewhere in this codebase for user-typed input)
// misinterprets a non-Thai MSISDN as a Thai national number and throws, 500ing the
// entire webhook for any non-Thai sender.
test('parseMetaMsisdn parses a raw non-Thai MSISDN (no leading +) as global E.164', () => {
  assert.equal(parseMetaMsisdn('14155552671'), '+14155552671')
})

test('parseMetaMsisdn parses a raw Thai MSISDN (no leading +) as global E.164', () => {
  assert.equal(parseMetaMsisdn('66812345678'), '+66812345678')
})

test('parseMetaMsisdn tolerates an already-prefixed +', () => {
  assert.equal(parseMetaMsisdn('+14155552671'), '+14155552671')
})

test('parseMetaMsisdn throws for a genuinely invalid MSISDN', () => {
  assert.throws(() => parseMetaMsisdn('123'))
})
