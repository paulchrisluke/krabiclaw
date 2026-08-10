import assert from 'node:assert/strict'
import test from 'node:test'

import { validateOrganizationBillingProjection } from '../../server/utils/organization-billing.ts'

const starterRow = {
  organization_id: 'org-test',
  stripe_customer_id: null,
  stripe_subscription_id: null,
  plan: null,
  status: null,
  payment_status: null,
  paid_through: null,
  past_due_since: null,
  current_period_end: null,
  cancel_at_period_end: null,
  updated_at: '2026-08-10T00:00:00.000Z',
}

function row(overrides: Partial<typeof starterRow>) {
  return { ...starterRow, ...overrides }
}

test('organization billing projection accepts Starter and a standalone customer', () => {
  assert.equal(validateOrganizationBillingProjection(null, 'org-test').effectivePlan, 'free')
  assert.equal(validateOrganizationBillingProjection(starterRow, 'org-test').status, 'free')
  const customerOnly = validateOrganizationBillingProjection(row({ stripe_customer_id: 'cus_123' }), 'org-test')
  assert.equal(customerOnly.stripeCustomerId, 'cus_123')
  assert.equal(customerOnly.effectivePlan, 'free')
})

test('organization billing projection rejects contradictory identifiers and cancellation', () => {
  assert.throws(
    () => validateOrganizationBillingProjection(row({ stripe_subscription_id: 'sub_123' }), 'org-test'),
    /stripe_subscription_id requires subscription state/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({ cancel_at_period_end: true }), 'org-test'),
    /cancel_at_period_end requires subscription state/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({ stripe_subscription_id: 'sub_123', plan: 'growth', status: 'active', payment_status: 'paid', paid_through: '2026-08-31T00:00:00.000Z' }), 'org-test'),
    /stripe_subscription_id requires stripe_customer_id/,
  )
})

test('organization billing projection rejects partial, malformed, and contradictory state', () => {
  assert.throws(
    () => validateOrganizationBillingProjection(row({ plan: 'growth' }), 'org-test'),
    /subscription projection fields are incomplete/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({ plan: 'growth', status: 'active', payment_status: 'paid', paid_through: 'not-a-date' }), 'org-test'),
    /paid_through must be a valid date/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({ plan: 'not-a-plan', status: 'active', payment_status: 'paid', paid_through: '2026-08-31T00:00:00.000Z' }), 'org-test'),
    /unknown plan/,
  )
  for (const retiredPlan of ['managed', 'seo_accelerator']) {
    assert.throws(
      () => validateOrganizationBillingProjection(row({ plan: retiredPlan, status: 'active', payment_status: 'paid', paid_through: '2026-08-31T00:00:00.000Z' }), 'org-test'),
      /unknown plan/,
    )
  }
  assert.throws(
    () => validateOrganizationBillingProjection(row({ plan: 'growth', status: 'active', payment_status: 'paid' }), 'org-test'),
    /paid active subscriptions require paid_through/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({ plan: 'growth', status: 'trialing', payment_status: 'trialing' }), 'org-test'),
    /trialing subscriptions require current_period_end/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({ plan: 'growth', status: 'free', payment_status: 'unknown' }), 'org-test'),
    /free status cannot use a paid plan/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({ organization_id: 'org-other' }), 'org-test'),
    /organization_id does not match/,
  )
})

test('organization billing projection rejects paid plans without Stripe authority IDs', () => {
  assert.throws(
    () => validateOrganizationBillingProjection(row({
      plan: 'growth',
      status: 'canceled',
      payment_status: 'unknown',
    }), 'org-test'),
    /paid plan requires stripe_subscription_id/,
  )
  assert.throws(
    () => validateOrganizationBillingProjection(row({
      stripe_subscription_id: 'sub_123',
      plan: 'growth',
      status: 'canceled',
      payment_status: 'unknown',
    }), 'org-test'),
    /stripe_subscription_id requires stripe_customer_id/,
  )
})
