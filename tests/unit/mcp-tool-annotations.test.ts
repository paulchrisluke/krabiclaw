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

  const catalogNames = MCP_PUBLIC_TOOLS.map(tool => tool.name).sort()
  const expectedNames = Object.keys(EXPECTED_TOOL_ANNOTATIONS).sort()
  assert.deepEqual(catalogNames, expectedNames)

  for (const tool of MCP_PUBLIC_TOOLS) {
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} must reject unknown arguments`)
    assert.deepEqual(tool.annotations, EXPECTED_TOOL_ANNOTATIONS[tool.name as keyof typeof EXPECTED_TOOL_ANNOTATIONS], `${tool.name} annotations`)
    assert.ok(tool.outputSchema, `${tool.name} must declare outputSchema`)
  }
  const byName = new Map(MCP_PUBLIC_TOOLS.map(tool => [tool.name, tool.annotations]))
  for (const name of ['update_product', 'set_collection_products', 'delete_collection', 'reconcile_products', 'reorder_media', 'update_media_asset', 'update_site_settings']) {
    assert.equal(byName.get(name)?.destructiveHint, true, name)
  }

  // A location's address is the one place its town and neighbourhood are
  // recorded, and MCP is the canonical way to write one.
  const updateLocation = MCP_PUBLIC_TOOLS.find(candidate => candidate.name === 'update_location')
  assert.ok(updateLocation && 'address' in updateLocation.inputSchema.properties, 'update_location must accept an address')
  assert.deepEqual(updateLocation.inputSchema.properties.address.required, ['regionCode', 'addressLines'], 'an address names its country and street')


})
