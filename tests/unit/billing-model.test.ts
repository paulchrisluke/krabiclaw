import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertNewSalePlan,
  BILLING_PLAN_POLICY,
  isKnownBillingPlan,
  isKnownRecurringPlan,
  isNewSalePlan,
  normalizeBillingPlanId,
} from '../../shared/billing-model.ts'

test('billing policy exposes only Starter and Growth runtime identities', () => {
  assert.equal(BILLING_PLAN_POLICY.starter, 'free')
  assert.deepEqual(BILLING_PLAN_POLICY.newSalePaid, ['growth'])
  assert.deepEqual(BILLING_PLAN_POLICY.knownRecurring, ['growth'])

  assert.equal(normalizeBillingPlanId(' Growth '), 'growth')
  assert.equal(isKnownBillingPlan('free'), true)
  assert.equal(isKnownRecurringPlan('growth'), true)
  assert.equal(isKnownRecurringPlan('managed'), false)
  assert.equal(isNewSalePlan('growth'), true)
  assert.equal(isNewSalePlan(' Growth '), false)
  assert.equal(isKnownRecurringPlan('MANAGED'), false)
  assert.equal(isNewSalePlan('managed'), false)
  assert.equal(isKnownBillingPlan('seo_accelerator'), false)
  assert.equal(isKnownBillingPlan('unknown'), false)

  assert.equal(assertNewSalePlan('GROWTH'), 'growth')
  assert.throws(
    () => assertNewSalePlan('managed'),
    /unknown paid plan/i,
  )
  assert.throws(
    () => assertNewSalePlan('unknown'),
    /Unknown paid plan/,
  )
})
