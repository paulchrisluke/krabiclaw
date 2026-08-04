import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldApplySubscriptionDeleted } from '../../server/utils/billing-subscription-events.ts'

test('applies a subscription deletion only to the currently recorded subscription', () => {
  assert.equal(shouldApplySubscriptionDeleted('sub_current', 'sub_current'), true)
  assert.equal(shouldApplySubscriptionDeleted('sub_replacement', 'sub_old'), false)
  assert.equal(shouldApplySubscriptionDeleted(null, 'sub_old'), false)
})
