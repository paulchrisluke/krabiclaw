import assert from 'node:assert/strict'
import test from 'node:test'

import { nextCimdTenantScopes } from '../../server/utils/auth.ts'

test('nextCimdTenantScopes assigns the full canonical set to a brand-new client', () => {
  assert.deepEqual(nextCimdTenantScopes([], true), ['openid', 'email', 'offline_access', 'tenant'])
})

test('nextCimdTenantScopes backfills email onto a persisted pre-upgrade tenant client', () => {
  const result = nextCimdTenantScopes(['openid', 'offline_access', 'tenant'], false)
  assert.ok(result)
  assert.deepEqual(new Set(result), new Set(['openid', 'offline_access', 'tenant', 'email']))
})

test('nextCimdTenantScopes leaves a client that already has the full canonical set untouched', () => {
  assert.equal(nextCimdTenantScopes(['openid', 'email', 'offline_access', 'tenant'], false), null)
})

test('nextCimdTenantScopes leaves a non-tenant client (e.g. platform_admin) untouched', () => {
  assert.equal(nextCimdTenantScopes(['openid', 'platform_admin'], false), null)
})

test('nextCimdTenantScopes rejects a tenant client with an unrecognized scope combination instead of silently patching it', () => {
  assert.throws(
    () => nextCimdTenantScopes(['openid', 'tenant', 'unexpected_scope'], false),
    /Unrecognized persisted CIMD scope state/,
  )
  assert.throws(
    () => nextCimdTenantScopes(['openid', 'email', 'tenant', 'tenant'], false),
    /Unrecognized persisted CIMD scope state/,
  )
  assert.throws(
    () => nextCimdTenantScopes(['openid', 'tenant', 'tenant'], false),
    /Unrecognized persisted CIMD scope state/,
  )
})

test('nextCimdTenantScopes rejects a malformed persisted scopes value', () => {
  assert.throws(() => nextCimdTenantScopes(null, false), /malformed persisted scopes value/)
  assert.throws(() => nextCimdTenantScopes(['tenant', 42], false), /malformed persisted scopes value/)
})
