import assert from 'node:assert/strict'
import test from 'node:test'
import { assertCatalogModeKey } from '../../scripts/lib/stripe-catalog-plan.mjs'
import { main, parseCli } from '../../scripts/seed-stripe.mjs'

// Catalog mutation must require an explicit live target, before provider access.
test('catalog mode rejects live keys by default and mismatched explicit targets', () => {
  assert.throws(() => assertCatalogModeKey('sk_live_guard'), /test-mode key/)
  assert.throws(() => assertCatalogModeKey('sk_test_guard', 'live'), /live-mode key/)
  assert.throws(() => assertCatalogModeKey('sk_live_guard', 'test'), /test-mode key/)
  assert.throws(() => assertCatalogModeKey('invalid', 'live'), /live-mode key/)
  assert.throws(() => assertCatalogModeKey('sk_live_guard', 'unknown'), /test or live/)
  assert.doesNotThrow(() => assertCatalogModeKey('rk_live_guard', 'live'))
  assert.doesNotThrow(() => assertCatalogModeKey('rk_test_guard'))
})

test('catalog CLI rejects conflicting account targets', () => {
  assert.throws(() => parseCli(['--require-test-mode', '--require-live-mode']), /not both/)
})

test('catalog apply cannot reach Stripe with an unapproved live target', async () => {
  let providerAccess = false
  await assert.rejects(main([
    '--apply', '--plan-file', 'unused-plan.json', '--confirm-sha256', 'unused',
    '--journal-file', 'unused-journal.json',
  ], {
    secretKey: 'sk_live_guard',
    stripeFactory: () => { providerAccess = true; throw new Error('Unexpected provider access') },
  }), /test-mode key/)
  assert.equal(providerAccess, false)
})

test('live catalog preflight rejects a test key before Stripe access', async () => {
  let providerAccess = false
  await assert.rejects(main(['--dry-run', '--require-live-mode'], {
    secretKey: 'sk_test_guard',
    stripeFactory: () => { providerAccess = true; throw new Error('Unexpected provider access') },
  }), /live-mode key/)
  assert.equal(providerAccess, false)
})
