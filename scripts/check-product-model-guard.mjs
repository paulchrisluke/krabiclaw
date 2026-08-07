#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ACTIVE_ROOTS = [
  'components',
  'composables',
  'lib',
  'pages',
  'scripts',
  'seed-definitions',
  'server',
  'utils',
]
const EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.vue', '.json'])
const RETIRED_FILES = [
  'components/billing/CreditPurchaseModal.vue',
  'components/billing/AutoTopupSettingsModal.vue',
  'composables/useCreditPurchase.ts',
  'server/api/billing/auto-topup.patch.ts',
  'server/api/billing/credits/add.post.ts',
  'server/api/billing/credits/charge.post.ts',
  'server/api/billing/service-addon.post.ts',
  'server/utils/auto-topup.ts',
  'shared/creditBundles.ts',
]
const FORBIDDEN_ACTIVE_PATTERNS = [
  /\/api\/billing\/credits\/(?:add|charge)/,
  /\/api\/billing\/auto-topup/,
  /\/api\/billing\/service-addon/,
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

const violations = []
for (const file of RETIRED_FILES) {
  if (existsSync(join(ROOT, file))) violations.push(`${file}: retired file still exists`)
}

for (const root of ACTIVE_ROOTS) {
  const directory = join(ROOT, root)
  if (!existsSync(directory)) continue
  for (const file of walk(directory)) {
    const relativePath = relative(ROOT, file)
    if (relativePath === 'scripts/check-product-model-guard.mjs') continue
    const source = readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN_ACTIVE_PATTERNS) {
      if (pattern.test(source)) violations.push(`${relativePath}: ${pattern}`)
    }
  }
}

if (violations.length) {
  console.error('Active retired product-model or translation paths found:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('Product-model guard passed: recurring subscription/quota paths are the only active billing model.')
