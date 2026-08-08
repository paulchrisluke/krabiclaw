import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mutationRoute = resolve(process.cwd(), 'server/api/admin/fulfillment/[id]/done.post.ts')
const adminPage = resolve(process.cwd(), 'pages/admin/index.vue')
const dashboardLayout = resolve(process.cwd(), 'layouts/dashboard.vue')

test('retired service-addon fulfillment writer is absent', () => {
  assert.equal(existsSync(mutationRoute), false, 'service-addon fulfillment mutation route must be removed')
})

test('admin add-on history view is explicitly read-only and audit-only', () => {
  const source = readFileSync(adminPage, 'utf8')
  assert.doesNotMatch(source, /\/api\/admin\/fulfillment\/\$\{id\}\/done/)
  assert.doesNotMatch(source, /\bmarkDone\b/)
  assert.match(source, /Historical service add-on audit \(read-only\)/)
  assert.match(source, /Retired service add-on records are preserved for audit only/)
  assert.match(source, /No historical service add-on records/)
  assert.match(source, /Show all historical records/)
  assert.match(source, /Failed to load historical service add-on records/)
  assert.doesNotMatch(source, /No pending service add-ons/)
  assert.doesNotMatch(source, /Show fulfilled/)
  assert.doesNotMatch(source, /Refresh queue/)
  assert.doesNotMatch(source, /Failed to load queue/)
  assert.doesNotMatch(source, /queueLoading|loadQueue|showAllPurchases/)
})

test('dashboard navigation names the retired surface as historical and read-only', () => {
  const source = readFileSync(dashboardLayout, 'utf8')
  assert.match(source, /label: 'Historical service add-on audit \(read-only\)'/)
  assert.doesNotMatch(source, /label: 'Add-ons'/)
})
