import assert from 'node:assert/strict'
import test from 'node:test'

import { nextCimdTenantScopes } from '../../server/utils/auth.ts'

test('nextCimdTenantScopes assigns the full canonical set to a brand-new client', () => {
  assert.deepEqual(nextCimdTenantScopes([]), ['openid', 'email', 'offline_access', 'tenant'])
})

test('nextCimdTenantScopes backfills email onto a persisted pre-upgrade tenant client', () => {
  const result = nextCimdTenantScopes(['openid', 'offline_access', 'tenant'])
  assert.ok(result)
  assert.deepEqual(new Set(result), new Set(['openid', 'offline_access', 'tenant', 'email']))
})

test('nextCimdTenantScopes leaves a client that already has email untouched', () => {
  assert.equal(nextCimdTenantScopes(['openid', 'email', 'offline_access', 'tenant']), null)
})

test('nextCimdTenantScopes does not touch a non-tenant client with its own existing scopes', () => {
  assert.equal(nextCimdTenantScopes(['openid', 'platform_admin']), null)
})
