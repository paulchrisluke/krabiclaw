import assert from 'node:assert/strict'
import test from 'node:test'

import { LOCATIONS_TOOLS } from '../../server/utils/mcp-tools/locations.ts'

test('location mutation tools accept the canonical city field', () => {
  for (const name of ['create_location', 'update_location']) {
    const tool = LOCATIONS_TOOLS.find(candidate => candidate.name === name)

    assert.ok(tool, `${name} must be registered`)
    assert.ok('city' in tool.inputSchema.properties, `${name} must accept city`)
  }
})
