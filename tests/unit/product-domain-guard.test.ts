import assert from 'node:assert/strict'
import test from 'node:test'

import { findProductDomainViolations } from '../../scripts/check-product-domain-guard.mjs'

test('Product-domain guard rejects retired storage, APIs, MCP names, payloads, and identifiers', () => {
  const retired = [
    'SELECT * FROM menu_items mi JOIN menus m ON m.id = mi.menu_id',
    "const row = payload.menu",
    "const tool = 'sync_menu_items'",
    "import { getMenu } from '~/server/utils/menu-management'",
    "const path = '/api/editor/sites/site-1/menus/menu-1'",
    "const route = '/dashboard/acme/sites/demo/locations/main/menu'",
    "type Old = MenuItem",
    "const category = 'menu_update'",
  ]

  for (const source of retired) {
    assert.notEqual(findProductDomainViolations('server/bad.ts', source).length, 0, source)
  }
})

test('Product-domain guard retains explicit restaurant presentation vocabulary', () => {
  const presentation = `
    const route = '/locations/main/menu/sushi'
    const schema = { '@type': 'MenuItem', hasMenuSection: [{ '@type': 'MenuSection' }] }
    const copy = 'Browse our menu'
  `
  assert.deepEqual(findProductDomainViolations('pages/locations/[slug]/menu/[productSlug].vue', presentation), [])
})

test('Product-domain guard rejects Product runtime fallbacks', () => {
  for (const source of [
    "const price = product.price_amount || 'TBD'",
    "const currency = site.default_currency || 'THB'",
    "const category = product.category || 'Uncategorized'",
    'const image = product.image || product.gallery[0]',
  ]) {
    assert.notEqual(findProductDomainViolations('components/products/BadProduct.vue', source).length, 0, source)
  }
})
