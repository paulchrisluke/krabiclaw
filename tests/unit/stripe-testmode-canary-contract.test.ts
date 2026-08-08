import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  assertStripeTestCanaryConfig,
  buildStripeCanaryEvidence,
  readReadiness,
  type BillingState,
  type StripeTestCanaryEnv,
} from '../../tests/e2e/helpers/stripe-testmode-canary.ts'
import { shouldReadStripeTestCanaryBillingState } from '../../server/utils/stripe-testmode-canary.ts'

const repoFile = async (path: string) => readFile(resolve(process.cwd(), path), 'utf8')

function paidGrowthState(): BillingState {
  return {
    billing: {
      organization_id: 'org-e2e-stripe',
      stripe_customer_id: 'cus_test_123',
      stripe_subscription_id: 'sub_test_123',
      status: 'active',
      plan: 'growth',
      payment_status: 'paid',
      current_period_end: '2026-09-08T00:00:00.000Z',
    },
    better_auth_subscription: {
      id: 'ba-sub-123',
      referenceId: 'org-e2e-stripe',
      plan: 'growth',
      status: 'active',
      stripeCustomerId: 'cus_test_123',
      stripeSubscriptionId: 'sub_test_123',
      periodEnd: '2026-09-08T00:00:00.000Z',
    },
    entitlements: [
      { site_id: 'site-a', key: 'plan', value: 'growth' },
      { site_id: 'site-a', key: 'ai_credits', value: '2000' },
      { site_id: 'site-b', key: 'plan', value: 'growth' },
      { site_id: 'site-b', key: 'ai_credits', value: '2000' },
    ],
    site_plans: [
      { site_id: 'site-a', plan: 'growth', status: 'active' },
      { site_id: 'site-b', plan: 'growth', status: 'active' },
    ],
    invoice_payments: [{
      stripe_invoice_id: 'in_test_123',
      organization_id: 'org-e2e-stripe',
      stripe_subscription_id: 'sub_test_123',
      status: 'paid',
      last_event_id: 'evt_test_123',
    }],
    webhook_events: [{ stripe_event_id: 'evt_test_123', status: 'processed' }],
  }
}

test('billing readiness passes only when both created sites and payment projections converge', () => {
  const readiness = readReadiness(paidGrowthState(), ['site-a', 'site-b'])

  assert.equal(readiness.ready, true)
  assert.equal(readiness.siteCount, 2)
  assert.equal(readiness.betterAuthReferenceId, 'org-e2e-stripe')
  assert.equal(readiness.billingIdentityMatches, true)
  assert.equal(readiness.invoiceStatus, 'paid')
  assert.equal(readiness.invoiceOrganizationId, 'org-e2e-stripe')
  assert.equal(readiness.webhookStatus, 'processed')
})

test('billing readiness rejects partial site projections, extra sites, and mismatched invoice events', () => {
  const missingEntitlement = paidGrowthState()
  missingEntitlement.entitlements = missingEntitlement.entitlements.filter(row => (
    !(row.site_id === 'site-b' && row.key === 'ai_credits')
  ))
  assert.equal(readReadiness(missingEntitlement, ['site-a', 'site-b']).ready, false)

  const wrongPlan = paidGrowthState()
  wrongPlan.site_plans[1]!.plan = 'free'
  assert.equal(readReadiness(wrongPlan, ['site-a', 'site-b']).ready, false)

  const extraSite = paidGrowthState()
  extraSite.site_plans.push({ site_id: 'site-extra', plan: 'growth', status: 'active' })
  extraSite.entitlements.push(
    { site_id: 'site-extra', key: 'plan', value: 'growth' },
    { site_id: 'site-extra', key: 'ai_credits', value: '2000' },
  )
  assert.equal(readReadiness(extraSite, ['site-a', 'site-b']).ready, false)

  const mismatchedInvoiceEvent = paidGrowthState()
  mismatchedInvoiceEvent.invoice_payments[0]!.last_event_id = 'evt-other'
  assert.equal(readReadiness(mismatchedInvoiceEvent, ['site-a', 'site-b']).ready, false)

  const mismatchedBillingOrganization = paidGrowthState()
  mismatchedBillingOrganization.billing!.organization_id = 'org-other'
  assert.equal(readReadiness(mismatchedBillingOrganization, ['site-a', 'site-b']).ready, false)

  const mismatchedBillingCustomer = paidGrowthState()
  mismatchedBillingCustomer.billing!.stripe_customer_id = 'cus-other'
  assert.equal(readReadiness(mismatchedBillingCustomer, ['site-a', 'site-b']).ready, false)

  const mismatchedBillingSubscription = paidGrowthState()
  mismatchedBillingSubscription.billing!.stripe_subscription_id = 'sub-other'
  assert.equal(readReadiness(mismatchedBillingSubscription, ['site-a', 'site-b']).ready, false)

  const mismatchedInvoiceOrganization = paidGrowthState()
  mismatchedInvoiceOrganization.invoice_payments[0]!.organization_id = 'org-other'
  assert.equal(readReadiness(mismatchedInvoiceOrganization, ['site-a', 'site-b']).ready, false)
})

test('ordinary billing-state reads never enable the provider-dependent Better Auth path', () => {
  assert.equal(shouldReadStripeTestCanaryBillingState({
    requested: false,
    canaryHeader: undefined,
    secretKey: 'sk_live_never-used',
  }), false)
  assert.equal(shouldReadStripeTestCanaryBillingState({
    requested: true,
    canaryHeader: '1',
    secretKey: 'sk_live_never-used',
  }), false)
  assert.equal(shouldReadStripeTestCanaryBillingState({
    requested: true,
    canaryHeader: '1',
    secretKey: 'sk_test_canaryonly',
  }), true)
})

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
  assert.match(stateRoute, /include_better_auth/)
  assert.match(stateRoute, /x-stripe-test-canary/)
  assert.match(stateRoute, /shouldReadStripeTestCanaryBillingState/)
  assert.match(stateRoute, /referenceId: organizationId/)
  assert.match(stateRoute, /customerType: 'organization'/)
  assert.match(stateRoute, /toWebRequest\(event\)\.headers/)
  assert.match(stateRoute, /stripe_invoice_payments/)
  assert.match(stateRoute, /site_plans/)
  assert.match(stateRoute, /SELECT se\.site_id, se\.key, se\.value, se\.source/)
  assert.doesNotMatch(stateRoute, /SELECT id, stripe_event_id, event_type, status, payload/)
})
