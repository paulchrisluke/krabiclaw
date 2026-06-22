import test from 'node:test'
import assert from 'node:assert/strict'

import { hasBetterAuthAdminRole, isPlatformAdmin, isPlatformOwnerEmail } from '../../server/utils/platform-auth.ts'

const env = {
  BETTER_AUTH_SECRET: 'test-secret',
  PLATFORM_OWNER_EMAILS: 'bamboo.chow@gmail.com, paulchrisluke@gmail.com',
} satisfies ApiRecord

test('hasBetterAuthAdminRole supports Better Auth comma-separated roles', () => {
  assert.equal(hasBetterAuthAdminRole('user,admin'), true)
  assert.equal(hasBetterAuthAdminRole('member'), false)
})

test('isPlatformOwnerEmail matches configured platform owner emails', () => {
  assert.equal(isPlatformOwnerEmail('bamboo.chow@gmail.com', env), true)
  assert.equal(isPlatformOwnerEmail('someone@example.com', env), false)
})

test('isPlatformAdmin allows either Better Auth admin role or bootstrap owner email', () => {
  assert.equal(isPlatformAdmin({ role: 'admin', email: 'someone@example.com' }, env), true)
  assert.equal(isPlatformAdmin({ role: 'user', email: 'paulchrisluke@gmail.com' }, env), true)
  assert.equal(isPlatformAdmin({ role: 'user', email: 'someone@example.com' }, env), false)
})
