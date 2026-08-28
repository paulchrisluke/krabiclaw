import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ATTRIBUTION_KEYS,
  normalizeReferrerHost,
  readAttributionParams,
  resolveAttributionTouch,
  sanitizeAttributionParams,
} from '../../utils/analytics-attribution.ts'

test('browser attribution emits only the ten allowlisted keys and first nonblank duplicate', () => {
  const params = new URLSearchParams()
  params.append('utm_source', '   ')
  params.append('utm_source', ' newsletter ')
  params.append('utm_source', 'ignored')
  params.set('email', 'guest@example.com')
  params.set('search', 'private words')
  params.set('gclid', ' abc123 ')

  assert.deepEqual(readAttributionParams(params), {
    utm_source: 'newsletter',
    gclid: 'abc123',
  })
  assert.deepEqual(ATTRIBUTION_KEYS, [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
  ])
})

test('attribution values reject controls, cap Unicode code points, and discard arbitrary object keys', () => {
  const long = '😀'.repeat(300)
  const result = sanitizeAttributionParams({
    utm_source: long,
    utm_medium: 'paid\nsearch',
    email: 'guest@example.com',
    nested: { secret: true },
  })

  assert.equal(Array.from(result.utm_source || '').length, 255)
  assert.equal(result.utm_medium, undefined)
  assert.equal('email' in result, false)
  assert.equal('nested' in result, false)
})

test('UTM wins over click IDs while preserving every supported click ID', () => {
  assert.deepEqual(resolveAttributionTouch({
    utm_source: 'Partner',
    utm_medium: 'affiliate',
    utm_campaign: 'Summer',
    gclid: 'g',
    fbclid: 'f',
    msclkid: 'm',
  }, 'referrer.example', []), {
    source: 'Partner',
    medium: 'affiliate',
    campaign: 'Summer',
    term: null,
    content: null,
    referrerHost: null,
    gclid: 'g',
    gbraid: null,
    wbraid: null,
    fbclid: 'f',
    msclkid: 'm',
  })
})

test('click-only touches use the fixed paid source priority', () => {
  assert.equal(resolveAttributionTouch({ gbraid: 'g', fbclid: 'f' }, null, [])?.source, 'Google')
  assert.equal(resolveAttributionTouch({ fbclid: 'f', msclkid: 'm' }, null, [])?.source, 'Facebook')
  assert.equal(resolveAttributionTouch({ msclkid: 'm' }, null, [])?.source, 'Microsoft')
  assert.equal(resolveAttributionTouch({ gclid: 'g' }, null, [])?.medium, 'paid')
})

test('external referrers create a hostname-only touch while direct and internal entries preserve state', () => {
  assert.equal(normalizeReferrerHost('https://User:pass@NEWS.Example/path?q=secret#fragment'), 'news.example')
  assert.equal(normalizeReferrerHost('javascript:alert(1)'), null)
  assert.equal(resolveAttributionTouch({}, null, ['tenant.example']), null)
  assert.equal(resolveAttributionTouch({}, 'tenant.example', ['tenant.example']), null)
  assert.deepEqual(resolveAttributionTouch({}, 'news.example', ['tenant.example']), {
    source: 'news.example',
    medium: 'referral',
    campaign: null,
    term: null,
    content: null,
    referrerHost: 'news.example',
    gclid: null,
    gbraid: null,
    wbraid: null,
    fbclid: null,
    msclkid: null,
  })
})
