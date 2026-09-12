import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPlanEntitlements } from '../../server/utils/billing-entitlements'
import {
  isLegalPracticeReadEnabled,
  isLegalPracticeMutationEnabled,
  isLegalConnectEnabled,
  isLegalIntakeWithoutPaymentEnabled,
  isLegalIntakePaymentEnabled,
  isLegalEngagementEnabled,
} from '../../server/utils/feature-flags'

test('getPlanEntitlements sets legal_operations: false for all plans', () => {
  assert.equal(getPlanEntitlements('free').legal_operations, false)
  assert.equal(getPlanEntitlements('growth').legal_operations, false)
})

test('getPlanEntitlements throws for unsupported plan', () => {
  assert.throws(() => getPlanEntitlements('managed'), /Unsupported runtime billing plan/)
})

test('Legal rollout-group flags default false when env is undefined or missing', () => {
  assert.equal(isLegalPracticeReadEnabled(undefined), false)
  assert.equal(isLegalPracticeMutationEnabled({}), false)
  assert.equal(isLegalConnectEnabled(undefined), false)
  assert.equal(isLegalIntakeWithoutPaymentEnabled({}), false)
  assert.equal(isLegalIntakePaymentEnabled(undefined), false)
  assert.equal(isLegalEngagementEnabled({}), false)
})

test('Legal rollout-group flags respect TRUE_VALUES (1, true, yes, on, enabled)', () => {
  assert.equal(isLegalPracticeReadEnabled({ LEGAL_PRACTICE_READ_ENABLED: '1' }), true)
  assert.equal(isLegalPracticeMutationEnabled({ LEGAL_PRACTICE_MUTATION_ENABLED: 'true' }), true)
  assert.equal(isLegalConnectEnabled({ LEGAL_CONNECT_ENABLED: 'yes' }), true)
  assert.equal(isLegalIntakeWithoutPaymentEnabled({ LEGAL_INTAKE_WITHOUT_PAYMENT_ENABLED: 'on' }), true)
  assert.equal(isLegalIntakePaymentEnabled({ LEGAL_INTAKE_PAYMENT_ENABLED: 'enabled' }), true)
  assert.equal(isLegalEngagementEnabled({ LEGAL_ENGAGEMENT_ENABLED: '1' }), true)
})

test('Legal rollout-group flags are case-insensitive and trim whitespace', () => {
  assert.equal(isLegalPracticeReadEnabled({ LEGAL_PRACTICE_READ_ENABLED: 'TRUE' }), true)
  assert.equal(isLegalEngagementEnabled({ LEGAL_ENGAGEMENT_ENABLED: '  true  ' }), true)
})

test('Legal rollout-group flags reject false/no/0 values', () => {
  assert.equal(isLegalPracticeReadEnabled({ LEGAL_PRACTICE_READ_ENABLED: 'false' }), false)
  assert.equal(isLegalPracticeMutationEnabled({ LEGAL_PRACTICE_MUTATION_ENABLED: 'no' }), false)
  assert.equal(isLegalConnectEnabled({ LEGAL_CONNECT_ENABLED: '0' }), false)
})
