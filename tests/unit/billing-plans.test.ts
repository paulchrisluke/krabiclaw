import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPlanEntitlements } from '../../server/utils/billing-entitlements'

test('getPlanEntitlements throws for unsupported plan', () => {
  assert.throws(() => getPlanEntitlements('managed'), /Unsupported runtime billing plan/)
})
