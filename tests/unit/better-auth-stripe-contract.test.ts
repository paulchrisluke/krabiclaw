import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasPermission } from 'better-auth/plugins'
import { organizationAccessControl, organizationRoles } from '../../utils/organization-access'

test('Better Auth Stripe is the server subscription authority', async () => {
  const source = await readFile('server/utils/auth.ts', 'utf8')

  assert.match(source, /betterAuthStripe\(/)
  assert.match(source, /organization: \{ enabled: true \}/)
  assert.match(source, /authorizeReference: async/)
  assert.match(source, /getOrgAdapter/)
  assert.match(source, /hasPermission/)
  assert.match(source, /stripeWebhookSecret: env\.STRIPE_WEBHOOK_SECRET/)
})

test('billing update permission is owner-only and requires organization membership', async () => {
  const options = { ac: organizationAccessControl, roles: organizationRoles }
  const can = async (member: { role: string } | null, permissions: Record<string, string[]> = { billing: ['update'] }) => {
    if (!member) return false
    return await hasPermission({
      organizationId: 'org-permission-test',
      role: member.role,
      options,
      permissions,
    }, undefined as never)
  }

  assert.equal(await can({ role: 'owner' }), true)
  assert.equal(await can({ role: 'admin' }, { billing: ['read'] }), true)
  assert.equal(await can({ role: 'admin' }), false)
  assert.equal(await can({ role: 'editor' }), false)
  assert.equal(await can({ role: 'member' }), false)
  assert.equal(await can(null), false)
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
