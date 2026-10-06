import assert from 'node:assert/strict'
import test from 'node:test'

import { MCP_PUBLIC_TOOLS } from '../../server/utils/mcp-tools/index.ts'
import { EXPECTED_TOOL_ANNOTATIONS, validateToolAnnotations } from '../../server/utils/mcp-tools/shared.ts'

test('MCP annotation validation accepts only internally consistent hint combinations', () => {
  assert.doesNotThrow(() => validateToolAnnotations(
    'search',
    { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    false,
  ))
  assert.doesNotThrow(() => validateToolAnnotations(
    'publish',
    { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    false,
  ))
  assert.throws(
    () => validateToolAnnotations(
      'bad_read',
      { readOnlyHint: true, openWorldHint: false, destructiveHint: true },
      false,
    ),
    /cannot declare destructiveHint as true/,
  )
  assert.throws(
    () => validateToolAnnotations(
      'bad_read',
      { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      true,
    ),
    /cannot require confirmation/,
  )
  assert.throws(
    () => validateToolAnnotations(
      'quiet_delete',
      { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
      false,
    ),
    /must require confirmation/,
  )

  const catalogNames = MCP_PUBLIC_TOOLS.map(tool => tool.name).sort()
  const expectedNames = Object.keys(EXPECTED_TOOL_ANNOTATIONS).sort()
  assert.deepEqual(catalogNames, expectedNames)

  for (const tool of MCP_PUBLIC_TOOLS) {
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} must reject unknown arguments`)
    assert.deepEqual(tool.annotations, EXPECTED_TOOL_ANNOTATIONS[tool.name as keyof typeof EXPECTED_TOOL_ANNOTATIONS], `${tool.name} annotations`)
    assert.ok(tool.outputSchema, `${tool.name} must declare outputSchema`)
  }
  const byName = new Map(MCP_PUBLIC_TOOLS.map(tool => [tool.name, tool]))
  // Irreversible or hard to reverse: destructive, and confirmed.
  for (const name of ['delete_product', 'delete_collection', 'set_collection_products', 'reconcile_products', 'publish_post', 'cancel_product_booking', 'issue_payment_refund', 'delete_content_block']) {
    assert.equal(byName.get(name)?.annotations.destructiveHint, true, name)
    assert.equal(byName.get(name)?.confirmRequired, true, name)
  }
  // An edit a later edit undoes is a write, not a destruction (#1259).
  for (const name of ['update_product', 'update_post', 'update_blog_post', 'update_location', 'update_organization_settings', 'set_media', 'reorder_media', 'update_media_asset', 'set_product_publication', 'set_workspace_context']) {
    assert.equal(byName.get(name)?.annotations.destructiveHint, false, name)
  }
  // A price restated with its id keeps the row payments reference.
  const updateProduct = byName.get('update_product')!
  const variant = updateProduct.inputSchema.properties.variants.items as { required: string[]; properties: { prices: { items: { required: string[]; properties: Record<string, unknown> } } } }
  assert.deepEqual(variant.required, [])
  assert.deepEqual(variant.properties.prices.items.required, [])
  assert.ok('id' in variant.properties.prices.items.properties, 'update_product prices accept an id')

  // A location's address is the one place its town and neighbourhood are
  // recorded, and MCP is the canonical way to write one.
  const updateLocation = MCP_PUBLIC_TOOLS.find(candidate => candidate.name === 'update_location')
  assert.ok(updateLocation && 'address' in updateLocation.inputSchema.properties, 'update_location must accept an address')
  assert.deepEqual(updateLocation.inputSchema.properties.address.required, ['regionCode', 'addressLines'], 'an address names its country and street')


})
