#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ROOTS = ['components', 'composables', 'config', 'layouts', 'lib', 'pages', 'scripts', 'seed-definitions', 'server', 'shared', 'tests', 'utils']
const EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.vue', '.json'])
const ALLOWED_FILES = new Set([
  'scripts/check-product-domain-guard.mjs',
  'tests/unit/product-domain-guard.test.ts',
])
const ALLOWED_PREFIXES = ['migrations/']

export const LEGACY_PRODUCT_DOMAIN_PATTERNS = [
  /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM|UPDATE)\s+[`"]?menus[`"]?\s*(?:\(|SET|WHERE)/i,
  /\b(?:FROM\s+[`"]?menus[`"]?\s+(?:WHERE|ORDER|GROUP|LIMIT|[a-z]{1,3}\s+(?:WHERE|JOIN))|JOIN\s+[`"]?menus[`"]?\s+\w+|sqliteTable\(['"]menus['"])/i,
  /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM|UPDATE)\s+[`"]?menu_items[`"]?\s*(?:\(|SET|WHERE)/i,
  /\b(?:FROM\s+[`"]?menu_items[`"]?\s+(?:WHERE|ORDER|GROUP|LIMIT|[a-z]{1,3}\s+(?:WHERE|JOIN))|JOIN\s+[`"]?menu_items[`"]?\s+\w+|sqliteTable\(['"]menu_items['"])/i,
  /\bmenu_item_media\b/i,
  /owner_type\s*(?:=|:|IN\s*\()[^\n]{0,80}['"]menu_item['"]/i,
  /\bmenu_item_slug\b/,
  /\bmenu_id\b/,
  /\bmenu_item_id\b/,
  /\bmenuItemSlug\b/,
  /\bmenuId\b/,
  /(?:from|import\()\s*['"][^'"]*(?:server\/types\/menu|menu-management|useMenuEditor)[^'"]*['"]/,
  /(?<!['"])\b(?:MenuItem|MenuSection|MenuEditor|MenuItemDetailEditor|AiMenuImport|useMenuEditor)\b/,
  /\/(?:api\/)?(?:editor|public)\/[^\s'"`]*(?:\/menus(?:\/|\b)|\/menu-items(?:\/|\b))/,
  /\/dashboard\/[^\s'"`]*\/menu(?:\/|\b)/,
  /\b(?:list_menus|get_menu|create_menu|update_menu|delete_menu|publish_menu|create_menu_item|update_menu_item|delete_menu_item|add_menu_items_batch|sync_menu_items|reorder_menu_items|rename_menu_section|delete_menu_section|import_menu_from_media)\b/,
  /\b(?:location|preview|payload|bootstrap|response|data)\.menu\b/,
  /\b(?:hasMenu|menuItemsBySection|menuTranslations|MenuTranslation|MenuItemTranslation)\b/,
  /\bmenu_update\b/,
]

const PRODUCT_RUNTIME_PREFIXES = [
  'components/products/',
  'composables/usePublicProductDetail.ts',
  'pages/products/',
  'pages/locations/[slug]/products/',
  'pages/locations/[slug]/menu/',
  'pages/menu/',
  'server/api/editor/sites/[siteId]/locations/[locationId]/products/',
  'server/utils/product-management.ts',
  'server/utils/public-products.ts',
  'utils/product-money.ts',
]

const PRODUCT_FALLBACK_PATTERNS = [
  /['"](?:TBD|THB|Uncategorized|—)['"]/,
  /(?:product\.)?image\s*(?:\?\?|\|\|)\s*(?:product\.)?gallery/,
  /(?:product\.)?order_url\s*(?:\?\?|\|\|)\s*['"]\/(?:order|locations\/)/,
]

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.wrangler', '.git'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (EXTENSIONS.has(extname(path))) files.push(path)
  }
  return files
}

export function findProductDomainViolations(relativePath, source) {
  const normalized = relativePath.replaceAll('\\', '/')
  if (ALLOWED_FILES.has(normalized) || ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix))) return []
  const patterns = [
    ...LEGACY_PRODUCT_DOMAIN_PATTERNS,
    ...(PRODUCT_RUNTIME_PREFIXES.some(prefix => normalized.startsWith(prefix)) ? PRODUCT_FALLBACK_PATTERNS : []),
  ]
  return patterns
    .filter(pattern => pattern.test(source))
    .map(pattern => `${normalized}: ${pattern}`)
}

export function collectProductDomainViolations(root = ROOT) {
  const violations = []
  for (const rootName of ROOTS) {
    const directory = join(root, rootName)
    if (!existsSync(directory)) continue
    for (const file of walk(directory)) {
      violations.push(...findProductDomainViolations(relative(root, file), readFileSync(file, 'utf8')))
    }
  }
  return violations
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = collectProductDomainViolations()
  if (violations.length) {
    console.error(`Product domain guard failed (${violations.length} violation${violations.length === 1 ? '' : 's'}):`)
    for (const violation of violations) console.error(`- ${violation}`)
    process.exit(1)
  }
  console.log('Product domain guard passed.')
}
