import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { validateFeatureLibrary } from '../../scripts/lib/feature-library.mjs'
import { getPlanEntitlements } from '../../server/utils/billing-entitlements.ts'
import { MCP_PUBLIC_TOOLS } from '../../server/utils/mcp-tools/index.ts'

const library = JSON.parse(readFileSync(new URL('../../docs/product/feature-library.json', import.meta.url), 'utf8'))
const policy = getPlanEntitlements('growth')
const options = {
  root: fileURLToPath(new URL('../..', import.meta.url)),
  entitlementKeys: Object.keys(policy).filter(key => typeof policy[key] === 'boolean'),
  mcpOperations: MCP_PUBLIC_TOOLS.map(tool => tool.name),
}

test('feature evidence remains current and every public MCP operation has a reviewed mapping', () => {
  assert.deepEqual(validateFeatureLibrary(library, options), [])
})

test('unknown entitlement keys and duplicate feature identities fail validation', () => {
  const invalid = structuredClone(library)
  invalid.features[0].entitlementKeys.push('invented_paid_feature')
  invalid.features[0].mcpOperations.push(invalid.features[0].mcpOperations[0])
  invalid.features[0].verification.sources.push(invalid.features[0].verification.sources[0])
  invalid.features.push(structuredClone(invalid.features[0]))
  const errors = validateFeatureLibrary(invalid, options)
  assert(errors.some(error => error.includes('unknown entitlement invented_paid_feature')))
  assert(errors.some(error => error.includes('Duplicate feature id: site.management')))
  assert(errors.some(error => error.includes('duplicate MCP operation')))
  assert(errors.some(error => error.includes('duplicate source evidence reference')))
})

test('new or removed MCP operations require a mapping review', () => {
  const errors = validateFeatureLibrary(library, { ...options, mcpOperations: [...options.mcpOperations.filter(name => name !== 'list_locations'), 'new_provider_action'] })
  assert(errors.some(error => error.includes('unknown MCP operation list_locations')))
  assert(errors.some(error => error.includes('Unmapped public MCP operation: new_provider_action')))
})

test('changed or missing evidence cannot retain a verified appearance', () => {
  const invalid = structuredClone(library)
  const source = invalid.features[0].verification.sources[0]
  invalid.features[0].verification.evidenceSha256[source] = '0'.repeat(64)
  invalid.features[0].verification.sources.push('server/missing-source.ts')
  const errors = validateFeatureLibrary(invalid, options)
  assert(errors.some(error => error.includes(`stale evidence ${source}`)))
  assert(errors.some(error => error.includes('missing evidence file server/missing-source.ts')))
})
