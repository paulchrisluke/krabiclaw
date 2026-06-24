import test from 'node:test'
import assert from 'node:assert/strict'

import { hasBetterAuthAdminRole, isPlatformAdmin } from '../../server/utils/platform-auth.ts'

const env = {
  BETTER_AUTH_SECRET: 'test-secret',
} satisfies ApiRecord

test('hasBetterAuthAdminRole supports Better Auth comma-separated roles', () => {
  assert.equal(hasBetterAuthAdminRole('user,admin'), true)
  assert.equal(hasBetterAuthAdminRole('member'), false)
})

test('isPlatformAdmin requires the Better Auth admin role', () => {
  assert.equal(isPlatformAdmin({ role: 'admin', email: 'someone@example.com' }, env), true)
  assert.equal(isPlatformAdmin({ role: 'user,admin', email: 'someone@example.com' }, env), true)
  assert.equal(isPlatformAdmin({ role: 'user', email: 'someone@example.com' }, env), false)
})
