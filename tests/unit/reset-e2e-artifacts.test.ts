import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('E2E reset removes restricted transfer requests before their stale initiating users', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/reset-e2e-artifacts.ts',
    '--stdout',
    '--older-than-hours=2',
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  const transferDelete = result.stdout.indexOf('DELETE FROM site_transfer_requests WHERE initiated_by_user_id IN')
  const userDelete = result.stdout.indexOf('DELETE FROM user WHERE id IN')
  assert.ok(transferDelete >= 0, 'expected stale E2E transfer requests to be swept')
  assert.ok(userDelete > transferDelete, 'restricted transfer requests must be deleted before users')
  assert.match(result.stdout, /id NOT IN \([^)]*'user-ncls-blawby'[^)]*\)/)
})

test('E2E reset removes disposable Better Auth Stripe subscriptions before their organizations', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/reset-e2e-artifacts.ts',
    '--stdout',
    '--older-than-hours=2',
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, result.stderr)
  const versionsDelete = result.stdout.indexOf('DELETE FROM stripe_subscription_versions')
  const subscriptionDelete = result.stdout.indexOf('DELETE FROM subscription WHERE referenceId IN')
  const organizationDelete = result.stdout.indexOf('DELETE FROM organization WHERE id IN')
  assert.ok(versionsDelete >= 0, 'expected disposable Stripe subscription versions to be swept')
  assert.ok(subscriptionDelete > versionsDelete, 'subscription IDs must be captured before Better Auth rows are deleted')
  assert.ok(organizationDelete > subscriptionDelete, 'Better Auth subscriptions must be deleted before their organizations')
  assert.match(result.stdout, /webhook audit\s+--\s+rows are intentionally retained/)
})
