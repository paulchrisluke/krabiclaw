import assert from 'node:assert/strict'
import test from 'node:test'
import { findProductModelViolations } from '../../scripts/check-product-model-guard.mjs'

test('publication guard covers MCP directory segments', () => {
  for (const path of [
    'server/utils/mcp-tools/content.ts',
    'server/utils/mcp-executor/content.ts',
    'server/utils/mcp-catalog-snapshots/tenant.json',
    'server/utils/chowbot-tools/content.ts',
    'server/utils/mcp-workflows.ts',
  ]) {
    assert.notEqual(findProductModelViolations(path, "const row = { status: 'draft' }").length, 0, path)
  }
})
