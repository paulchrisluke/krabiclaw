import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('public pricing sends authenticated users through site-scoped billing', async () => {
  const source = await readFile('components/billing/PricingTable.vue', 'utf8')

  assert.match(source, /navigateTo\(billingUrl\)/)
  assert.doesNotMatch(source, /\$fetch<[^>]+>\('\/api\/billing\/checkout'/)
})

test('dashboard upsell includes the selected site in checkout requests', async () => {
  const source = await readFile('components/billing/ServiceUpsellModal.vue', 'utf8')

  assert.match(source, /const siteId = dashboard\.siteId\.value/)
  assert.match(source, /body: \{ siteId, plan: type\.value, interval: 'month' \}/)
})
