import assert from 'node:assert/strict'
import test from 'node:test'

import localeQueryMiddleware from '../../server/middleware/locale-query.ts'

function event(url: string) {
  return { req: new Request(url) } as never
}

test('locale query selection is limited to public data APIs', () => {
  assert.throws(
    () => localeQueryMiddleware(event('https://tenant.example/menu?locale=th')),
    /exact locale-prefixed path/i,
  )
  assert.equal(
    localeQueryMiddleware(event('https://tenant.example/api/public/sites/site-1/page?locale=th')),
    undefined,
  )
})
