import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectScheduledPaidRows,
  hasScheduledPaidEntitlement,
} from '../../server/utils/scheduled-billing-access.ts'

const projectionRow = {
  organization_id: 'org-kikuzuki',
  stripe_customer_id: 'cus_kikuzuki',
  stripe_subscription_id: 'sub_kikuzuki',
  plan: 'growth',
  status: 'active',
  payment_status: 'paid',
  paid_through: '2026-08-23T00:00:00.000Z',
  past_due_since: null,
  current_period_end: '2026-08-23T00:00:00.000Z',
  cancel_at_period_end: false,
  updated_at: '2026-08-07T00:00:00.000Z',
}

const now = new Date('2026-08-07T00:00:00.000Z')

test('scheduled paid entitlement requires invoice-backed paid_through', () => {
  assert.throws(
    () => hasScheduledPaidEntitlement(
      { ...projectionRow, paid_through: null },
      'google_places',
      now,
    ),
    /paid active subscriptions require paid_through/,
  )
  assert.equal(hasScheduledPaidEntitlement({
    ...projectionRow,
    payment_status: 'unknown',
    paid_through: null,
  }, 'google_places', now), false)
  assert.equal(
    hasScheduledPaidEntitlement(projectionRow, 'google_places', now),
    true,
  )
})

test('scheduled paid entitlement fails closed for expired or malformed billing projections', () => {
  assert.equal(
    hasScheduledPaidEntitlement(
      { ...projectionRow, paid_through: '2026-08-06T23:59:59.000Z' },
      'managed_service',
      now,
    ),
    false,
  )
  assert.throws(
    () => hasScheduledPaidEntitlement(
      { ...projectionRow, plan: 'retired_plan' },
      'review_requests',
      now,
    ),
    /unknown plan/,
  )
  assert.equal(hasScheduledPaidEntitlement(null, 'google_places', now), false)
})

test('paged scheduled access skips expired rows without starving later paid organizations', async () => {
  const expired = Array.from({ length: 200 }, (_, index) => ({
    ...projectionRow,
    organization_id: `org-expired-${index}`,
    paid_through: '2026-08-06T00:00:00.000Z',
  }))
  const candidates = [
    ...expired,
    { ...projectionRow, organization_id: 'org-paid-after-first-page' },
  ]
  const calls: Array<{ limit: number; offset: number }> = []
  const rows = await collectScheduledPaidRows(
    async (limit, offset) => {
      calls.push({ limit, offset })
      return candidates.slice(offset, offset + limit)
    },
    'review_requests',
    { pageSize: 200, maxPages: 3, maxEligible: 200, now },
  )
  assert.deepEqual(rows.map(row => row.organization_id), ['org-paid-after-first-page'])
  assert.deepEqual(calls, [{ limit: 200, offset: 0 }, { limit: 200, offset: 200 }])
})

test('paged scheduled access surfaces malformed state and fails on an exhausted scan bound', async () => {
  const malformed = [
    ...Array.from({ length: 200 }, (_, index) => ({
      ...projectionRow,
      organization_id: `org-expired-${index}`,
      paid_through: '2026-08-06T00:00:00.000Z',
    })),
    { ...projectionRow, organization_id: 'org-malformed', paid_through: null },
  ]
  await assert.rejects(
    () => collectScheduledPaidRows(
      async (limit, offset) => malformed.slice(offset, offset + limit),
      'review_requests',
      { pageSize: 200, maxPages: 2, now },
    ),
    /paid active subscriptions require paid_through/,
  )

  const expired = Array.from({ length: 400 }, (_, index) => ({
    ...projectionRow,
    organization_id: `org-expired-${index}`,
    paid_through: '2026-08-06T00:00:00.000Z',
  }))
  await assert.rejects(
    () => collectScheduledPaidRows(
      async (limit, offset) => expired.slice(offset, offset + limit),
      'review_requests',
      { pageSize: 200, maxPages: 2, now },
    ),
    /scan exceeded its bounded page window/,
  )
})
