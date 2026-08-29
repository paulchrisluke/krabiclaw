#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ACTIVE_ROOTS = [
  'components',
  'composables',
  'i18n',
  'layouts',
  'lib',
  'pages',
  'scripts',
  'seed-definitions',
  'server',
  'shared',
  'utils',
]
const SEED_NAMING_ROOTS = ['seed-definitions']
const EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.vue', '.json'])
const RETIRED_FILES = [
  'components/billing/CreditPurchaseModal.vue',
  'components/billing/AutoTopupSettingsModal.vue',
  'components/saya/_ignored/SayaUpgradeModal.vue',
  'composables/useCreditPurchase.ts',
  'composables/useUpgradeModal.ts',
  'server/api/billing/auto-topup.patch.ts',
  'server/api/billing/portal.post.ts',
  'server/api/billing/credits/add.post.ts',
  'server/api/billing/credits/charge.post.ts',
  'server/api/billing/checkout.post.ts',
  'server/api/billing/service-addon.post.ts',
  'server/api/admin/fulfillment/[id]/done.post.ts',
  'server/utils/auto-topup.ts',
  'shared/creditBundles.ts',
]
const SITE_TRANSFER_POLICY_FILE = 'shared/site-transfer-policy.ts'
export const FORBIDDEN_ACTIVE_PATTERNS = [
  /\/api\/billing\/credits\/(?:add|charge)/,
  /\/api\/billing\/checkout/,
  /\/api\/billing\/auto-topup/,
  /\/api\/billing\/service-addon/,
  /\/api\/admin\/fulfillment\/\$\{[^}]+\}\/done/,
  /\bstripe_credit_topups\b/,
  /\bservice_addon_purchases\b/,
  /\bauto_topup_(?:enabled|bundle|threshold)\b/,
  /\buseCreditPurchase\b/,
  /\bCreditPurchaseModal\b/,
  /\bAutoTopupSettingsModal\b/,
  /STRIPE_PRICE_CREDITS_/,
  /STRIPE_PRICE_(?:SEASONAL|GBP_SETUP|TRANSLATION)\b/,
  /\bcreateOneTimePrice\b/,
  /\bapplySiteSubscription\b/,
  /\buseSiteSubscribe\b/,
  /\bofferSubscribe\b/,
  /\bofferSubscribePlan\b/,
  /\/api\/billing\/site-subscribe/,
  /\bsiteContentTranslations\b/,
  /\bCompiledSeedSiteContentTranslation\b/,
  /\bCuratedSiteContentTranslationDefinition\b/,
  /\brenderCompiled(?:Demo|PotteryHouse)TranslationsBlock\b/,
  /\b(?:get_translation_inventory|start_translation_job|list_translation_jobs|get_translation_job|run_translation_job_batch|get_translation_review_items|save_translation_review_item|publish_translations)\b/,
  /\b(?:starter\s+)?AI credits?\s+(?:on|at) signup\b/i,
  /\b\d[\d,]*\s+AI credits?\s+to start\b/i,
  /\b(?:Included in|Upgrade to|Requires?)\s+(?:the\s+)?(?:Managed|SEO Accelerator)(?:\s+plan)?\b/i,
  /รวมอยู่ในแผน\s+(?:Managed|SEO Accelerator)/u,
  /\bunlimited Growth\b/i,
  /\bchargeFlatCredits(?:ForUser)?\s*\([\s\S]{0,260}?\.catch\s*\(/,
  /\bupdate_tenant_page_draft\b/,
  /\bblog_draft\b/,
  /\bunpublish_(?:blog_post|platform_blog_post|platform_doc)\b/,
  /\bSELECT\b[^;`]{0,800}\bs\.plan\b/i,
  /\bob\.(?:plan|status|current_period_end|cancel_at_period_end|ga_client_id|ga_user_id)\b/,
  /\borganization_billing\b[^;]{0,500}\b(?:ga_client_id|ga_user_id)\b/,
]
const FORBIDDEN_SEED_NAMING_PATTERNS = [
  /\bsiteContent\b/,
  /\bsiteLocaleVariants\b/,
  /\bSeedTenantPageTranslation\b/,
  /\b(?:translations|translatedRows)\b/,
]
// Final publication lifecycle: posts/blog articles persist only as
// `published` or `scheduled` (creating one publishes it immediately unless
// `scheduled_for` is future-dated; editing changes the live document as
// "Save live changes"; public removal is a destructive delete, never an
// archive/unpublish). Platform docs have no publication status — every
// persisted one is public. Site locales persist only as `published` or
// `disabled`. Facebook publication is immediate with no external-draft
// option. `draft`/`archived`/unpublish states were removed everywhere except
// onboarding's pre-site-creation `onboarding_drafts` aggregate, which is a
// resumable private draft that predates the real record and isn't a
// publication state on an existing one. D1 triggers reject legacy post/blog
// states because those tables can't be safely rebuilt; this guard is the
// runtime-code half of that enforcement.
const PUBLICATION_MODEL_PATH = /(?:^seed-definitions\/|\/(?:chowbot-tools|mcp-catalog-snapshots|mcp-tools|mcp-executor|mcp-prompts)\/|(?:blog|post|locale|platform-content|mcp-catalog|mcp-tools|mcp-executor|mcp-prompts|mcp-workflows|chowbot-agent|facebook)[^/]*\.(?:ts|js|mjs|vue|json)$|\/(?:blog|posts|docs|locales)\/|\/(?:blog|posts|docs|locales)\.(?:ts|vue)$)/i
const FORBIDDEN_PUBLICATION_PATTERNS = [
  /\b(?:Publication|Publishing)Status\b[^\n]{0,160}['"](?:draft|archived)['"]/,
  /\bstatus\b[^\n]{0,100}['"](?:draft|archived)['"]/,
  /['"](?:draft|archived)['"][^\n]{0,100}\bstatus\b/,
  /\bstatus\s+(?:=|IN\s*\()[^\n;]{0,100}['"](?:draft|archived)['"]/i,
]

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.wrangler' || entry.name === 'generated') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (EXTENSIONS.has(extname(path))) files.push(path)
  }
  return files
}

function readScopedSchemaTables(schemaSource) {
  const tables = new Set()
  const tablePattern = /export const (\w+)\s*=\s*sqliteTable\("([^"]+)"\s*,\s*\{/g
  let match
  while ((match = tablePattern.exec(schemaSource))) {
    const columnsStart = tablePattern.lastIndex
    let depth = 1
    let cursor = columnsStart
    for (; cursor < schemaSource.length && depth > 0; cursor += 1) {
      if (schemaSource[cursor] === '{') depth += 1
      else if (schemaSource[cursor] === '}') depth -= 1
    }
    if (depth !== 0) throw new Error(`Unclosed sqliteTable block for ${match[2]}`)

    const block = schemaSource.slice(columnsStart, cursor - 1)
    const callbackStart = block.search(/\},\s*\(table\)\s*=>\s*\[/)
    const columns = (callbackStart >= 0 ? block.slice(0, callbackStart) : block)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    const properties = new Set()
    for (const property of columns.matchAll(/^\s*([A-Za-z_]\w*)\s*:/gm)) properties.add(property[1])
    if (properties.has('organization_id') && properties.has('site_id')) tables.add(match[2])
  }
  return tables
}

function readSiteTransferPolicy(policySource) {
  const policy = {}
  const pattern = /export const SITE_TRANSFER_(REPARENT|RETAIN|REVOKE|REBUILD)_TABLES\s*=\s*\[([\s\S]*?)\]\s+as const/g
  let match
  while ((match = pattern.exec(policySource))) {
    const category = match[1].toLowerCase()
    policy[category] = Array.from(match[2].matchAll(/['"]([^'"]+)['"]/g), item => item[1])
  }
  return policy
}

export function collectSiteTransferPolicyViolations(root = ROOT) {
  const schemaPath = join(root, 'server', 'db', 'schema.ts')
  const policyPath = join(root, SITE_TRANSFER_POLICY_FILE)
  if (!existsSync(schemaPath) && !existsSync(policyPath)) return []
  if (!existsSync(schemaPath)) return [`${schemaPath}: schema.ts is missing`]
  if (!existsSync(policyPath)) return [`${policyPath}: site transfer policy is missing`]

  const schemaTables = readScopedSchemaTables(readFileSync(schemaPath, 'utf8'))
  const policy = readSiteTransferPolicy(readFileSync(policyPath, 'utf8'))
  const categories = ['reparent', 'retain', 'revoke', 'rebuild']
  const listed = categories.flatMap(category => policy[category] ?? [])
  const violations = []
  const seen = new Set()
  for (const table of listed) {
    if (seen.has(table)) violations.push(`site-transfer-policy: duplicate table ${table}`)
    seen.add(table)
    if (!schemaTables.has(table)) violations.push(`site-transfer-policy: unknown scoped table ${table}`)
  }
  for (const table of schemaTables) {
    if (!seen.has(table)) violations.push(`site-transfer-policy: missing scoped table ${table}`)
  }
  for (const category of categories) {
    if (!policy[category]) violations.push(`site-transfer-policy: missing category ${category}`)
  }
  return violations
}

export function findProductModelViolations(relativePath, source) {
  if (['scripts/check-product-model-guard.mjs', 'scripts/report-publication-cleanup.mjs'].includes(relativePath.replaceAll('\\', '/'))) return []
  const normalizedPath = relativePath.replaceAll('\\', '/')
  if (normalizedPath === 'server/db/schema.ts') return []
  const checksPublicationModel = !normalizedPath.includes('onboarding')
    && !normalizedPath.includes('public-draft-bootstrap')
    && PUBLICATION_MODEL_PATH.test(normalizedPath)
  const patterns = checksPublicationModel
    ? [...FORBIDDEN_ACTIVE_PATTERNS, ...FORBIDDEN_PUBLICATION_PATTERNS]
    : FORBIDDEN_ACTIVE_PATTERNS
  return patterns
    .filter((pattern) => pattern.test(source))
    .map((pattern) => `${relativePath}: ${pattern}`)
}

export function collectProductModelViolations(root = ROOT) {
  const violations = [...collectSiteTransferPolicyViolations(root)]
  for (const file of RETIRED_FILES) {
    if (existsSync(join(root, file))) violations.push(`${file}: retired file still exists`)
  }

  for (const activeRoot of ACTIVE_ROOTS) {
    const directory = join(root, activeRoot)
    if (!existsSync(directory)) continue
    for (const file of walk(directory)) {
      const relativePath = relative(root, file)
      const source = readFileSync(file, 'utf8')
      violations.push(...findProductModelViolations(relativePath, source))
    }
  }

  for (const seedRoot of SEED_NAMING_ROOTS) {
    const directory = join(root, seedRoot)
    if (!existsSync(directory)) continue
    for (const file of walk(directory)) {
      const relativePath = relative(root, file)
      const source = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN_SEED_NAMING_PATTERNS) {
        if (pattern.test(source)) violations.push(`${relativePath}: ${pattern}`)
      }
    }
  }

  return violations
}

export function runProductModelGuard(root = ROOT, log = console) {
  const violations = collectProductModelViolations(root)
  if (violations.length) {
    log.error('Active retired product-model or seed locale paths found:')
    for (const violation of violations) log.error(`- ${violation}`)
    return false
  }

  log.log('Product-model guard passed: retired billing and publication-state contracts are absent from active runtime code.')
  return true
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectRun && !runProductModelGuard()) process.exitCode = 1
