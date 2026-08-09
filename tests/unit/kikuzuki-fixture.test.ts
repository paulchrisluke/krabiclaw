import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compiledKikuzukiSeed,
  renderKikuzukiBillingBlock,
} from '../../seed-definitions/kikuzuki.ts'

test('Kikuzuki billing block seeds canonical Better Auth and app projections', () => {
  const sql = renderKikuzukiBillingBlock()

  assert.equal(compiledKikuzukiSeed.organizationBilling?.plan, 'growth')
  assert.equal(compiledKikuzukiSeed.aiCredits?.balance, 2000)
  assert.match(sql, /INSERT OR REPLACE INTO ai_credits/)
  assert.match(sql, /balance_period_key/)
  assert.match(sql, /INSERT OR IGNORE INTO usage_quota_grants/)
  assert.match(sql, /'ai_inference', 2000, 'credit'/)
  assert.match(sql, /INSERT OR REPLACE INTO subscription/)
  assert.match(sql, /'sub-org-kikuzuki'/)
  assert.match(sql, /'cus-org-kikuzuki'/)
  assert.match(sql, /'stripe-org-kikuzuki'/)
  assert.match(sql, /INSERT OR REPLACE INTO organization_billing/)
  assert.match(sql, /'ob-org-kikuzuki'/)
  assert.match(sql, /'paid'/)
  assert.match(sql, /INSERT OR REPLACE INTO stripe_invoice_payments/)
  assert.match(sql, /'in-org-kikuzuki'/)
  assert.match(sql, /'price_growth_month'/)
  assert.match(sql, /UPDATE organization\s+SET stripeCustomerId = 'cus-org-kikuzuki'\s+WHERE id = 'org-kikuzuki';/)
  assert.match(sql, /INSERT OR REPLACE INTO organization_entitlements/)
  assert.match(sql, /INSERT OR REPLACE INTO site_billing/)
  assert.match(sql, /INSERT OR REPLACE INTO site_entitlements/)
  assert.match(sql, /'sent-site-kikuzuki-managed_service'/)
})
