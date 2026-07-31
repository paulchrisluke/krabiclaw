import test from 'node:test'
import assert from 'node:assert/strict'

import { hasPlatformAdminPermission } from '../../utils/platform-admin-access.ts'

test('hasPlatformAdminPermission uses the Better Auth Admin access-control role contract', () => {
  assert.equal(hasPlatformAdminPermission('user,admin'), true)
  assert.equal(hasPlatformAdminPermission('admin', { platform: ['billing'] }), true)
  assert.equal(hasPlatformAdminPermission('user', { platform: ['billing'] }), false)
  assert.equal(hasPlatformAdminPermission('member'), false)
})

test('hasPlatformAdminPermission authorizes default platform access', () => {
  assert.equal(hasPlatformAdminPermission('admin'), true)
  assert.equal(hasPlatformAdminPermission('user,admin'), true)
  assert.equal(hasPlatformAdminPermission('user'), false)
})
