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
  assert.equal(byName.get('analyze_document')?.openWorldHint, true)
  assert.deepEqual(byName.get('import_from_maps'), {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  })
  for (const name of ['update_product', 'rename_product_category', 'move_products', 'move_product_category', 'reorder_media', 'update_media_asset', 'update_notification_settings', 'update_site_settings']) {
    assert.equal(byName.get(name)?.destructiveHint, true, name)
  }

  for (const name of ['create_location', 'update_location']) {
    const tool = MCP_PUBLIC_TOOLS.find(candidate => candidate.name === name)
    assert.ok(tool && 'city' in tool.inputSchema.properties, `${name} must accept the canonical city field`)
  }

  for (const name of ['create_location_qa', 'update_location_qa']) {
    const tool = MCP_PUBLIC_TOOLS.find(candidate => candidate.name === name)
    assert.ok(tool && 'is_owner_answer' in tool.inputSchema.properties, `${name} must accept the canonical is_owner_answer field`)
  }
})
