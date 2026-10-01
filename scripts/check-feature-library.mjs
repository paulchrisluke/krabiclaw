import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { validateFeatureLibrary, validatePricingComparison } from './lib/feature-library.mjs'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)
const [{ getPlanEntitlements }, { MCP_PUBLIC_TOOLS }, { PRICING_COMPARISON }] = await Promise.all([
  import('../server/utils/billing-entitlements.ts'),
  import('../server/utils/mcp-tools/index.ts'),
  import('../shared/pricing-comparison.ts'),
])
const root = fileURLToPath(new URL('..', import.meta.url))
const library = JSON.parse(readFileSync(new URL('../docs/product/feature-library.json', import.meta.url), 'utf8'))
const policy = getPlanEntitlements('growth')
const errors = validateFeatureLibrary(library, {
  root,
  entitlementKeys: Object.keys(policy).filter(key => typeof policy[key] === 'boolean'),
  mcpOperations: MCP_PUBLIC_TOOLS.map(tool => tool.name),
})
errors.push(...validatePricingComparison(library, PRICING_COMPARISON))
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Feature library passed: ${library.features.length} evidence entries, ${MCP_PUBLIC_TOOLS.length} public MCP operations mapped. Live Stripe marketing drift was not checked.`)
}
