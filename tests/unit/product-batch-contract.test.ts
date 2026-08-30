import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { PRODUCTS_TOOLS } from '../../server/utils/mcp-tools/products.ts'

function tool(name: string) {
  const definition = PRODUCTS_TOOLS.find(candidate => candidate.name === name)
  assert.ok(definition, `${name} must exist`)
  return definition
}

test('Product batch tools expose one explicitly scoped atomic request', () => {
  for (const name of ['batch_create_products', 'sync_products']) {
    const definition = tool(name)
    const properties = definition.inputSchema.properties as Record<string, Record<string, unknown>>
    assert.deepEqual(definition.inputSchema.required, ['location_id', 'products'])
    assert.ok(properties.site_id)
    assert.equal(properties.products.maxItems, 100)
    assert.equal(properties.products.minItems, name === 'batch_create_products' ? 1 : undefined)
    assert.match(definition.description, /Atomically/i)
  }
})

test('Product batch service validates all rows before one D1 batch and never truncates input', () => {
  const source = readFileSync(new URL('../../server/utils/product-management.ts', import.meta.url), 'utf8')
  const create = source.slice(source.indexOf('export async function createProductsBatch'), source.indexOf('export async function syncProducts'))
  const sync = source.slice(source.indexOf('export async function syncProducts'), source.indexOf('export async function updateProduct'))

  for (const segment of [create, sync]) {
    assert.equal((segment.match(/\bawait executeBatch\(/g) ?? []).length, 1)
    assert.doesNotMatch(segment, /\.slice\(0,\s*\d+\)/)
    assert.match(segment, /inputs\.length > 100/)
  }
  assert.match(create, /const inserts: BatchQuery\[\] = inputs\.flatMap/)
  assert.match(sync, /const writes: BatchQuery\[\]/)
  assert.match(sync, /product_id values must be unique/)
})
