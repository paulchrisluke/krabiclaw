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

test('product-model guard rejects retired site and organization billing columns in runtime SQL', () => {
  assert.notEqual(findProductModelViolations(
    'server/utils/mcp-workflows.ts',
    'const query = `SELECT s.id, s.plan FROM sites s`',
  ).length, 0)
  assert.notEqual(findProductModelViolations(
    'server/api/admin/clients.get.ts',
    'const query = `SELECT ob.plan, ob.status, ob.current_period_end FROM organization_billing ob`',
  ).length, 0)
  assert.notEqual(findProductModelViolations(
    'server/api/dashboard/onboarding/complete.post.ts',
    'const query = `SELECT ob.ga_client_id FROM organization_billing ob`',
  ).length, 0)
})
