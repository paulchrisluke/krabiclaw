import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let stripeClientConstructions = 0
let fakeStripe: Record<string, unknown> | null = null

mock.module('../../server/utils/stripe-client.ts', {
  namedExports: {
    createStripeClient: () => {
      stripeClientConstructions += 1
      if (!fakeStripe) throw new Error('Stripe client construction should not be reached')
      return fakeStripe
    },
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: { createAuth: () => ({}) },
})

mock.module('../../server/utils/better-auth-timestamps.ts', {
  namedExports: { betterAuthTimestampToIso: () => '' },
})

mock.module('../../server/utils/billing-entitlements.ts', {
  namedExports: { getPlanEntitlements: () => ({}) },
})

mock.module('../../server/utils/organization-billing.ts', {
  namedExports: { getOrganizationBillingProjection: async () => ({}) },
})

mock.module('../../utils/organization-access.ts', {
  namedExports: { organizationAccessControl: {}, organizationRoles: {} },
})

mock.module('better-auth/plugins', {
  namedExports: {
    getOrgAdapter: () => ({}),
    hasPermission: async () => true,
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async () => ({ meta: { changes: 0 } }),
    executeBatch: async () => ({ meta: { changes: 0 } }),
    queryAll: async () => [],
    queryFirst: async () => undefined,
  },
})

const { getPriceIdForPlan } = await import('../../server/utils/billing.ts?new-sale-plan-guard')

test.beforeEach(() => {
  stripeClientConstructions = 0
  fakeStripe = null
})

test('getPriceIdForPlan rejects non-Growth plans before missing-secret/provider errors', async () => {
  for (const plan of ['managed', 'seo_accelerator', 'unknown-plan']) {
    await assert.rejects(
      () => getPriceIdForPlan({}, plan),
      (error: unknown) => /unknown paid plan/i.test(String((error as Error).message)),
    )
    assert.equal(stripeClientConstructions, 0)
  }
})

test('getPriceIdForPlan rejects a Growth catalog amount or currency drift', async () => {
  for (const pricePatch of [{ unit_amount: 3900 }, { currency: 'eur' }]) {
    fakeStripe = {
      products: {
        list: async () => ({
          data: [{ id: 'prod-growth', active: true, metadata: { plan_id: 'growth' } }],
          has_more: false,
        }),
      },
      prices: {
        list: async () => ({
          data: [{
            id: 'price-growth',
            product: 'prod-growth',
            type: 'recurring',
            unit_amount: 4900,
            currency: 'usd',
            recurring: { interval: 'month', interval_count: 1 },
            ...pricePatch,
          }],
          has_more: false,
        }),
      },
    }

    await assert.rejects(
      () => getPriceIdForPlan({ STRIPE_SECRET_KEY: 'sk_test_catalog' }, 'growth'),
      /Growth monthly price must be exactly USD 4900 cents/,
    )
  }
})
