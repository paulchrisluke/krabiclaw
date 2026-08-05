import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('public pricing sends authenticated users through site-scoped billing', async () => {
  const source = await readFile('components/billing/PricingTable.vue', 'utf8')

  assert.match(source, /navigateTo\(billingUrl\)/)
  assert.doesNotMatch(source, /\$fetch<[^>]+>\('\/api\/billing\/checkout'/)
})

test('dashboard recurring upsell uses the organization Better Auth Stripe subscription', async () => {
  const source = await readFile('components/billing/ServiceUpsellModal.vue', 'utf8')

  assert.match(source, /const siteId = dashboard\.siteId\.value/)
  assert.match(source, /const \{ offerSubscribe \} = useSiteSubscribe\(\)/)
  assert.match(source, /offerSubscribe\(siteId, type\.value\)/)
  assert.doesNotMatch(source, /authClient\.subscription\.upgrade/)
  assert.doesNotMatch(source, /\/api\/billing\/checkout/)
})

test('saved-card site subscribe path is absent', async () => {
  const source = await readFile('composables/useSiteSubscribe.ts', 'utf8')

  assert.doesNotMatch(source, /\/api\/billing\/site-subscribe/)
  assert.match(source, /authClient\.subscription\.upgrade/)
  assert.match(source, /customerType: 'organization'/)
})
