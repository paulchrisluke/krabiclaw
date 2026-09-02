import assert from 'node:assert/strict'
import test from 'node:test'

import localeQueryMiddleware from '../../server/middleware/locale-query.ts'

function event(url: string) {
  return { req: new Request(url) } as never
}

test('public page URLs reject locale query selection', () => {
  assert.throws(
    () => localeQueryMiddleware(event('https://tenant.example/menu?locale=th')),
    /exact locale-prefixed path/i,
  )
})

test('public data APIs accept exact locale queries for localized route hydration', () => {
  assert.equal(
    localeQueryMiddleware(event('https://tenant.example/api/public/sites/site-1/page?locale=th')),
    undefined,
  )
})
