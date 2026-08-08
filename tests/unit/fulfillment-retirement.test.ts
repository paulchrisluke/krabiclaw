import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mutationRoute = resolve(process.cwd(), 'server/api/admin/fulfillment/[id]/done.post.ts')
const adminPage = resolve(process.cwd(), 'pages/admin/index.vue')

test('retired service-addon fulfillment writer is absent', () => {
  assert.equal(existsSync(mutationRoute), false, 'service-addon fulfillment mutation route must be removed')
})

test('admin add-on history view has no fulfillment mutation control', () => {
  const source = readFileSync(adminPage, 'utf8')
  assert.doesNotMatch(source, /\/api\/admin\/fulfillment\/\$\{id\}\/done/)
  assert.doesNotMatch(source, /\bmarkDone\b/)
})
