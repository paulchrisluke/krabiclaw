import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  assertStripeTestCanaryConfig,
  buildStripeCanaryEvidence,
  type StripeTestCanaryEnv,
} from '../../tests/e2e/helpers/stripe-testmode-canary.ts'

const repoFile = async (path: string) => readFile(resolve(process.cwd(), path), 'utf8')

test('Stripe canary refuses live keys, missing dev route secret, and incomplete candidate identity', () => {
  const base: StripeTestCanaryEnv = {
    RUN_STRIPE_TEST_CANARY: '1',
    STRIPE_SECRET_KEY: 'sk_test_123',
    E2E_DEV_ROUTE_SECRET: 'dev-route-secret',
    STRIPE_CANARY_SOURCE_SHA: 'a'.repeat(40),
    STRIPE_CANARY_WORKER_VERSION_ID: 'b66c2b18-8d55-4af4-8b2c-f11111111111',
    STRIPE_CANARY_EVIDENCE_PATH: '.tmp/stripe-canary-evidence.json',
  }

  assert.equal(assertStripeTestCanaryConfig(base).enabled, true)
  assert.throws(() => assertStripeTestCanaryConfig({ ...base, STRIPE_SECRET_KEY: 'sk_live_123' }), /test-mode/i)
  assert.throws(() => assertStripeTestCanaryConfig({ ...base, E2E_DEV_ROUTE_SECRET: '' }), /E2E_DEV_ROUTE_SECRET/i)
  assert.throws(() => assertStripeTestCanaryConfig({ ...base, STRIPE_CANARY_SOURCE_SHA: 'short' }), /source SHA/i)
  assert.throws(() => assertStripeTestCanaryConfig({ ...base, STRIPE_CANARY_WORKER_VERSION_ID: '' }), /Worker version/i)
  assert.equal(assertStripeTestCanaryConfig({ ...base, RUN_STRIPE_TEST_CANARY: undefined }).enabled, false)
})

test('Stripe canary evidence is redacted and records the candidate identity', () => {
  const evidence = buildStripeCanaryEvidence({
    sourceSha: 'a'.repeat(40),
    baseUrl: 'https://staging.krabiclaw.com',
    workerVersionId: 'b66c2b18-8d55-4af4-8b2c-f11111111111',
    checkoutSessionId: 'cs_test_1234567890',
    subscriptionId: 'sub_test_1234567890',
    invoiceId: 'in_test_1234567890',
    webhookEventId: 'evt_test_1234567890',
    siteCount: 2,
    statuses: { checkout: 'complete', subscription: 'active', invoice: 'paid', webhook: 'processed' },
  })

  assert.equal(evidence.testMode, true)
  assert.equal(evidence.sourceSha, 'a'.repeat(40))
  assert.equal(evidence.workerVersionId, 'b66c2b18-8d55-4af4-8b2c-f11111111111')
  assert.match(evidence.checkoutSessionId, /^cs_test_[a-f0-9]{8}$/)
  assert.match(evidence.subscriptionId, /^sub_test_[a-f0-9]{8}$/)
  assert.match(evidence.invoiceId, /^in_test_[a-f0-9]{8}$/)
  assert.match(evidence.webhookEventId, /^evt_test_[a-f0-9]{8}$/)
  assert.equal(evidence.siteCount, 2)
  assert.doesNotMatch(JSON.stringify(evidence), /1234567890/)
})

test('full lane keeps Stripe provider canary post-promotion and skipped by default', async () => {
  const workflow = await repoFile('.github/workflows/ci-full.yml')
  const spec = await repoFile('tests/e2e/stripe-testmode-canary.spec.ts')
  const stateRoute = await repoFile('server/api/dev/billing-state.get.ts')

  assert.match(spec, /RUN_STRIPE_TEST_CANARY.*===.*['"]1['"]|RUN_STRIPE_TEST_CANARY.*==.*['"]1['"]/)
  assert.match(spec, /describe\.skip|test\.skip/)
  assert.doesNotMatch(spec, /api\/billing\/checkout/)
  assert.match(workflow, /RUN_STRIPE_TEST_CANARY=1/)
  assert.match(workflow, /Stripe test-mode checkout canary/)
  assert.match(workflow, /Promoting candidate to 100%[\s\S]*Stripe test-mode checkout canary/)
  assert.match(workflow, /unset WORKER_VERSION_OVERRIDE[\s\S]*RUN_STRIPE_TEST_CANARY=1/)
  assert.match(workflow, /stripe-canary-evidence\.json/)
  assert.match(stateRoute, /listActiveSubscriptions/)
  assert.match(stateRoute, /referenceId: organizationId/)
  assert.match(stateRoute, /customerType: 'organization'/)
  assert.match(stateRoute, /toWebRequest\(event\)\.headers/)
  assert.match(stateRoute, /stripe_invoice_payments/)
  assert.match(stateRoute, /site_plans/)
  assert.match(stateRoute, /SELECT se\.site_id, se\.key, se\.value, se\.source/)
  assert.doesNotMatch(stateRoute, /SELECT id, stripe_event_id, event_type, status, payload/)
})
