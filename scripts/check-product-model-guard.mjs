#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ACTIVE_ROOTS = [
  'components',
  'composables',
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
  'composables/useCreditPurchase.ts',
  'server/api/billing/auto-topup.patch.ts',
  'server/api/billing/credits/add.post.ts',
  'server/api/billing/credits/charge.post.ts',
  'server/api/billing/checkout.post.ts',
  'server/api/billing/service-addon.post.ts',
  'server/api/admin/fulfillment/[id]/done.post.ts',
  'server/utils/auto-topup.ts',
  'shared/creditBundles.ts',
]
export const FORBIDDEN_ACTIVE_PATTERNS = [
  /\/api\/billing\/credits\/(?:add|charge)/,
  /\/api\/billing\/checkout/,
  /\/api\/billing\/auto-topup/,
  /\/api\/billing\/service-addon/,
  /\/api\/admin\/fulfillment\/\$\{[^}]+\}\/done/,
  /\bUPDATE\s+service_addon_purchases\b/i,
  /\buseCreditPurchase\b/,
  /\bCreditPurchaseModal\b/,
  /\bAutoTopupSettingsModal\b/,
  /STRIPE_PRICE_CREDITS_/,
  /STRIPE_PRICE_(?:SEASONAL|GBP_SETUP|TRANSLATION)\b/,
  /\bcreateOneTimePrice\b/,
  /\bsiteContentTranslations\b/,
  /\bCompiledSeedSiteContentTranslation\b/,
  /\bCuratedSiteContentTranslationDefinition\b/,
  /\brenderCompiled(?:Demo|PotteryHouse)TranslationsBlock\b/,
  /\b(?:get_translation_inventory|start_translation_job|list_translation_jobs|get_translation_job|run_translation_job_batch|get_translation_review_items|save_translation_review_item|publish_translations)\b/,
  /\b(?:starter\s+)?AI credits?\s+(?:on|at) signup\b/i,
  /\b\d[\d,]*\s+AI credits?\s+to start\b/i,
]
const FORBIDDEN_SEED_NAMING_PATTERNS = [
  /\bsiteContent\b/,
  /\bsiteLocaleVariants\b/,
  /\bSeedTenantPageTranslation\b/,
  /\b(?:translations|translatedRows)\b/,
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
  if (relativePath === 'scripts/check-product-model-guard.mjs') return []
  return FORBIDDEN_ACTIVE_PATTERNS
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

  log.log('Product-model guard passed: recurring subscription/quota paths are the only active billing model.')
  return true
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectRun && !runProductModelGuard()) process.exitCode = 1
