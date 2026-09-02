import assert from 'node:assert/strict'
import test from 'node:test'

import { nextCimdTenantScopes } from '../../server/utils/auth.ts'

test('persisted tenant CIMD scopes gain email only from the recognized legacy state', () => {
  assert.deepEqual(
    nextCimdTenantScopes(['openid', 'offline_access', 'tenant'], false),
    ['openid', 'email', 'offline_access', 'tenant'],
  )
  assert.equal(nextCimdTenantScopes(['openid', 'email', 'offline_access', 'tenant'], false), null)
  assert.equal(nextCimdTenantScopes(['openid', 'platform_admin'], false), null)
  assert.throws(
    () => nextCimdTenantScopes(['openid', 'tenant', 'unexpected_scope'], false),
    /Unrecognized persisted CIMD scope state/,
  )
})
