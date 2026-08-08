import assert from 'node:assert/strict'
import test from 'node:test'

import { mapOrganizationSites } from '../../server/utils/billing-site-resource.ts'

test('all organization sites share the resolved subscription state despite stale site rows', () => {
  const sites = mapOrganizationSites([
    { id: 'site-a', brand_name: 'A', subdomain: 'a', legacyPlan: 'free' },
    { id: 'site-b', brand_name: 'B', subdomain: 'b', legacyPlan: 'managed' },
  ], {
    plan: 'growth',
    subscriptionStatus: 'active',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
  })

  assert.deepEqual(sites.map(site => ({ siteId: site.siteId, plan: site.plan, subscriptionStatus: site.subscriptionStatus })), [
    { siteId: 'site-a', plan: 'growth', subscriptionStatus: 'active' },
    { siteId: 'site-b', plan: 'growth', subscriptionStatus: 'active' },
  ])
})
