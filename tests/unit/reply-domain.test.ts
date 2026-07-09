import test from 'node:test'
import assert from 'node:assert/strict'

import { getReplyDomain } from '../../server/utils/reply-domain.ts'

test('getReplyDomain strips ports from localhost platform domains', () => {
  assert.equal(getReplyDomain({ NUXT_PUBLIC_PLATFORM_DOMAIN: 'http://localhost:3000' }), 'reply.krabiclaw.local')
})

test('getReplyDomain keeps full hostnames for deployed environments', () => {
  assert.equal(getReplyDomain({ NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://staging.krabiclaw.com' }), 'reply.staging.krabiclaw.com')
})
