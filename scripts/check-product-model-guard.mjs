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
export const FORBIDDEN_ACTIVE_PATTERNS = [
  // The platform split (#870): one site model, one MCP surface, one contact path, no /admin.
  /\bplatform_doc\b/,
  /\bplatform_contact\b/,
  /\/api\/mcp\/platform\b/,
  /\bPLATFORM_(?:SITE|ORGANIZATION)_ID\b/,
  /\bensurePlatformMediaScope\b/,
  /\bisPlatformSite\b/,
  /\/api\/admin\//,
  /\bpages\/admin\b/,
  /\breorder_blog_posts\b/,
  /\bmanagedServiceEnabled\b/,
  /\bsite_transfer_requests\b/,
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
const PUBLICATION_MODEL_PATH = /(?:^seed-definitions\/|\/(?:chowbot-tools|mcp-catalog-snapshots|mcp-tools|mcp-executor|mcp-prompts)\/|(?:blog|post|locale|platform-content|mcp-catalog|mcp-tools|mcp-executor|mcp-prompts|mcp-workflows|chowbot-agent|facebook)[^/]*\.(?:ts|js|mjs|vue|json)$|\/(?:blog|posts|docs|locales)\/|\/(?:blog|posts|docs|locales)\.(?:ts|vue)$)/i
const FORBIDDEN_PUBLICATION_PATTERNS = [
  /\b(?:Publication|Publishing)Status\b[^\n]{0,160}['"]archived['"]/,
  /\bstatus\b[^\n]{0,100}['"]archived['"]/,
  /['"]archived['"][^\n]{0,100}\bstatus\b/,
  /\bstatus\s+(?:=|IN\s*\()[^\n;]{0,100}['"]archived['"]/i,
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

export function findProductModelViolations(relativePath, source) {
  // The transfer script names retired values because it is what removes them.
  if (['scripts/check-product-model-guard.mjs', 'scripts/report-publication-cleanup.mjs', 'scripts/rebaseline-data.mjs'].includes(relativePath.replaceAll('\\', '/'))) return []
  const normalizedPath = relativePath.replaceAll('\\', '/')
  if (normalizedPath === 'server/db/schema.ts') return []
  const checksPublicationModel = !normalizedPath.includes('onboarding')
    && PUBLICATION_MODEL_PATH.test(normalizedPath)
  const patterns = checksPublicationModel
    ? [...FORBIDDEN_ACTIVE_PATTERNS, ...FORBIDDEN_PUBLICATION_PATTERNS]
    : FORBIDDEN_ACTIVE_PATTERNS
  return patterns
    .filter((pattern) => pattern.test(source))
    .map((pattern) => `${relativePath}: ${pattern}`)
}

export function collectProductModelViolations(root = ROOT) {
  const violations = []
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

  log.log('Product-model guard passed: retired billing, archive, shadow-draft, and unpublish contracts are absent from active runtime code.')
  return true
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectRun && !runProductModelGuard()) process.exitCode = 1
