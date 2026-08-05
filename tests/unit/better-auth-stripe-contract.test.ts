import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('Better Auth Stripe is the server subscription authority', async () => {
  const source = await readFile('server/utils/auth.ts', 'utf8')

  assert.match(source, /betterAuthStripe\(/)
  assert.match(source, /organization: \{ enabled: true \}/)
  assert.match(source, /authorizeReference: async/)
  assert.match(source, /stripeWebhookSecret: env\.STRIPE_WEBHOOK_SECRET/)
})

test('the legacy webhook delegates to Better Auth Stripe', async () => {
  const source = await readFile('server/api/billing/webhook.post.ts', 'utf8')

  assert.match(source, /target\.pathname = '\/api\/auth\/stripe\/webhook'/)
  assert.doesNotMatch(source, /constructEventAsync|subscriptions\.create|applySiteSubscription/)
})

test('usage metering uses neutral resource names and is idempotent', async () => {
  const source = await readFile('server/utils/usage-metering.ts', 'utf8')

  assert.match(source, /'messaging'/)
  assert.match(source, /'maps_api'/)
  assert.match(source, /INSERT OR IGNORE INTO usage_events/)
  assert.match(source, /INSERT OR IGNORE INTO usage_quota_grants/)
  assert.match(source, /resetOrganizationQuota/)
})
