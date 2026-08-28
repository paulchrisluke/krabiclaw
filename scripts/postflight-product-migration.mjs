#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import {
  SUPPORTED_CURRENCIES,
  checksum,
  createD1Query,
  emitReport,
  parseMigrationTarget,
  runD1Command,
} from './utils/product-migration-report.mjs'

const target = parseMigrationTarget(process.argv.slice(2))
if (!target.report) throw new Error('--report <preflight-report.json> is required')
const expected = JSON.parse(readFileSync(target.report, 'utf8'))
if (expected.kind !== 'product-migration-preflight' || expected.ok !== true) {
  throw new Error('Postflight requires a successful Product migration preflight report')
}
const query = createD1Query(target)
const violations = []
const tables = new Set(query(`SELECT name FROM sqlite_master WHERE type = 'table'`).map(row => String(row.name)))
for (const retired of ['menus', 'menu_items', 'menu_item_media']) if (tables.has(retired)) violations.push(`retired table still exists: ${retired}`)
if (!tables.has('products')) violations.push('products table is missing')

const siteColumns = query(`PRAGMA table_info('sites')`)
const currencyColumn = siteColumns.find(column => column.name === 'default_currency')
if (!currencyColumn || Number(currencyColumn.notnull) !== 1) {
  violations.push('sites.default_currency is not enforced as NOT NULL')
}
const currencyTriggers = new Map(query(`
  SELECT name, sql
    FROM sqlite_master
   WHERE type = 'trigger'
     AND name IN ('sites_default_currency_insert_guard', 'sites_default_currency_update_guard')
   ORDER BY name
`).map(row => [String(row.name), String(row.sql)]))
const supportedCurrencySql = [...SUPPORTED_CURRENCIES].map(code => `'${code}'`).join(',')
for (const name of ['sites_default_currency_insert_guard', 'sites_default_currency_update_guard']) {
  const triggerSql = currencyTriggers.get(name)
  if (!triggerSql) {
    violations.push(`missing currency enforcement trigger: ${name}`)
    continue
  }
  if (triggerSql.includes('trim(') || !triggerSql.includes(`NEW.\`default_currency\` NOT IN (${supportedCurrencySql})`)) {
    violations.push(`${name} does not enforce exact canonical supported currency codes`)
  }
}
const currencyProbeSource = query(`SELECT organization_id, theme_id, theme, source_locale, url_structure, vertical FROM sites ORDER BY id LIMIT 1`)[0]
if (!currencyProbeSource) {
  violations.push('currency enforcement probes require an existing site row')
} else {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`
  const nonce = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  const probeSiteId = `postflight-currency-${nonce}`
  const invalidProbeIds = []
  const probeSlug = `postflight-currency-${nonce}`.toLowerCase()
  const insertColumns = 'id, organization_id, theme_id, theme, slug, source_locale, default_currency, url_structure, vertical'
  const sourceValues = [
    currencyProbeSource.organization_id,
    currencyProbeSource.theme_id,
    currencyProbeSource.theme,
    currencyProbeSource.source_locale,
  ].map(quote)
  const trailingValues = [currencyProbeSource.url_structure, currencyProbeSource.vertical].map(quote)
  const insertSql = (id, slug, currencySql) => `INSERT INTO sites (${insertColumns}) VALUES (${quote(id)}, ${sourceValues.join(', ')}, ${quote(slug)}, ${currencySql}, ${trailingValues.join(', ')})`
  const invalidValues = [null, '', ' ', ' THB ', 'thb', 'ZZZ']
  const expectedCurrencyRejection = result => !result.ok && /sites\.default_currency must be a supported currency|NOT NULL constraint failed: sites\.default_currency/.test(result.error ?? '')
  try {
    const initial = runD1Command(target, insertSql(probeSiteId, probeSlug, quote([...SUPPORTED_CURRENCIES][0])))
    if (!initial.ok) {
      violations.push(`currency enforcement probe site could not be created: ${initial.error}`)
    } else {
      for (const value of SUPPORTED_CURRENCIES) {
        const result = runD1Command(target, `UPDATE sites SET default_currency = ${quote(value)} WHERE id = ${quote(probeSiteId)}`)
        if (!result.ok) violations.push(`supported currency update failed for ${JSON.stringify(value)}: ${result.error}`)
      }
      for (const [index, value] of invalidValues.entries()) {
        const currencySql = value === null ? 'NULL' : quote(value)
        const updateResult = runD1Command(target, `UPDATE sites SET default_currency = ${currencySql} WHERE id = ${quote(probeSiteId)}`)
        if (!expectedCurrencyRejection(updateResult)) {
          violations.push(`invalid currency update was not rejected by a database constraint for ${JSON.stringify(value)}: ${updateResult.error ?? 'command succeeded'}`)
        }
        const invalidId = `${probeSiteId}-invalid-${index}`
        invalidProbeIds.push(invalidId)
        const insertResult = runD1Command(target, insertSql(invalidId, `${probeSlug}-invalid-${index}`, currencySql))
        if (!expectedCurrencyRejection(insertResult)) {
          violations.push(`invalid currency insert was not rejected by a database constraint for ${JSON.stringify(value)}: ${insertResult.error ?? 'command succeeded'}`)
        }
      }
    }
  } finally {
    // Explicit ID list rather than a LIKE pattern - D1 enforces a tight
    // LIKE/GLOB pattern-length limit ("LIKE or GLOB pattern too complex"),
    // and every id this probe could have created is already known here.
    const probeIds = [probeSiteId, ...invalidProbeIds]
    const idListSql = probeIds.map(quote).join(', ')
    const cleanup = runD1Command(target, `DELETE FROM sites WHERE id IN (${idListSql})`)
    if (!cleanup.ok) violations.push(`currency enforcement probe cleanup failed: ${cleanup.error}`)
    const leftovers = query(`SELECT id FROM sites WHERE id IN (${idListSql})`)
    if (leftovers.length) violations.push(`currency enforcement probe rows remain: ${leftovers.map(row => row.id).join(', ')}`)
  }
}

const rows = query(`
  SELECT id, organization_id, site_id, location_id, category, name, slug, description,
         price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url,
         is_visible, available, featured, featured_sort_order, sort_order, tags_json,
         details_json, seo_title, seo_description, canonical_url, robots, source,
         created_at, updated_at, created_by, updated_by
    FROM products
   ORDER BY id
`)
const products = rows.map(row => ({
  id: String(row.id),
  organization_id: String(row.organization_id),
  site_id: String(row.site_id),
  location_id: String(row.location_id),
  category: String(row.category),
  name: String(row.name),
  slug: String(row.slug),
  description: String(row.description),
  price_amount: String(row.price_amount),
  compare_at_price_amount: row.compare_at_price_amount === null ? null : String(row.compare_at_price_amount),
  sale_starts_at: row.sale_starts_at,
  sale_ends_at: row.sale_ends_at,
  order_url: row.order_url,
  is_visible: Number(row.is_visible),
  available: Number(row.available),
  featured: Number(row.featured),
  featured_sort_order: Number(row.featured_sort_order),
  sort_order: Number(row.sort_order),
  tags: JSON.parse(row.tags_json),
  details: JSON.parse(row.details_json),
  seo_title: row.seo_title,
  seo_description: row.seo_description,
  canonical_url: row.canonical_url,
  robots: row.robots,
  source: String(row.source),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  created_by: String(row.created_by),
  updated_by: String(row.updated_by),
}))
const checks = {
  product_ids: checksum(products.map(row => ({ id: row.id }))),
  product_identity: checksum(products.map(({ id, site_id, location_id, slug }) => ({ id, site_id, location_id, slug }))),
  product_core: checksum(products.map(({ id, organization_id, site_id, location_id, category, name, slug, description, tags, details, seo_title, seo_description, canonical_url, robots }) => ({ id, organization_id, site_id, location_id, category, name, slug, description, tags, details, seo_title, seo_description, canonical_url, robots }))),
  product_prices: checksum(products.map(({ id, price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url }) => ({ id, price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url }))),
  product_visibility: checksum(products.map(({ id, is_visible, available, featured, featured_sort_order }) => ({ id, is_visible, available, featured, featured_sort_order }))),
  product_ordering: checksum(products.map(({ id, site_id, location_id, category, sort_order }) => ({ id, site_id, location_id, category, sort_order }))),
  product_audit: checksum(products.map(({ id, source, created_at, updated_at, created_by, updated_by }) => ({ id, source, created_at, updated_at, created_by, updated_by }))),
}

const productReviews = query(`
  SELECT id, product_id, organization_id, site_id, location_id, created_at
    FROM reviews WHERE product_id IS NOT NULL ORDER BY id
`).map(row => ({ id: String(row.id), product_id: String(row.product_id), organization_id: String(row.organization_id), site_id: String(row.site_id), location_id: String(row.location_id), created_at: row.created_at }))
checks.product_reviews = checksum(productReviews)

const gallery = query(`
  SELECT id AS placement_id, organization_id, site_id, owner_id AS product_id,
         asset_id, sort_order, status, created_at, updated_at
    FROM media_placements
   WHERE owner_type = 'product' AND slot = 'gallery'
   ORDER BY owner_id, sort_order, id
`).map(row => ({ placement_id: String(row.placement_id), organization_id: String(row.organization_id), site_id: String(row.site_id), product_id: String(row.product_id), asset_id: String(row.asset_id), sort_order: Number(row.sort_order), status: String(row.status), created_at: String(row.created_at), updated_at: String(row.updated_at) }))
const primary = query(`
  SELECT organization_id, site_id, owner_id AS product_id, asset_id
    FROM media_placements
   WHERE owner_type = 'product' AND slot = 'image'
   ORDER BY owner_id, id
`).map(row => ({ organization_id: String(row.organization_id), site_id: String(row.site_id), product_id: String(row.product_id), asset_id: String(row.asset_id) }))
const assetIds = [...new Set(gallery.map(row => row.asset_id))].sort()
const assets = assetIds.length ? query(`SELECT * FROM media_assets WHERE id IN (${assetIds.map(id => `'${id.replaceAll("'", "''")}'`).join(',')}) ORDER BY id`) : []
checks.media_gallery = checksum(gallery)
checks.media_assets = checksum(assets)
checks.media_primary = checksum(primary)

const productPlacementRows = query(`
  SELECT mp.id, mp.organization_id, mp.site_id, mp.owner_id AS product_id, mp.slot,
         mp.asset_id, mp.sort_order, mp.status, ma.organization_id AS asset_organization_id,
         ma.site_id AS asset_site_id, ma.status AS asset_status, ma.kind,
         ma.public_url, ma.thumbnail_url
    FROM media_placements mp
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id
   WHERE mp.owner_type = 'product'
   ORDER BY mp.owner_id, mp.slot, mp.sort_order, mp.id
`)
const galleriesByProduct = new Map()
for (const row of productPlacementRows) {
  if (!['image', 'gallery'].includes(String(row.slot))) violations.push(`Product placement ${row.id} uses unsupported slot ${row.slot}`)
  if (row.asset_organization_id === null || row.asset_site_id === null) violations.push(`Product placement ${row.id} references a missing media asset`)
  if (row.organization_id !== row.asset_organization_id || row.site_id !== row.asset_site_id) violations.push(`Product placement ${row.id} has a media asset scope mismatch`)
  const renderable = row.kind === 'image'
    ? Boolean(String(row.public_url ?? '').trim())
    : row.kind === 'video'
      ? Boolean(String(row.public_url ?? '').trim() && String(row.thumbnail_url ?? '').trim())
      : false
  if (row.status === 'active' && (row.asset_status !== 'active' || !renderable)) {
    violations.push(`active Product placement ${row.id} references an inactive or unrenderable asset`)
  }
  if (row.slot === 'image' && (Number(row.sort_order) !== 0 || row.status !== 'active')) {
    violations.push(`Product primary placement ${row.id} must be active at sort_order zero`)
  }
  if (row.slot === 'gallery') {
    const rows = galleriesByProduct.get(String(row.product_id)) ?? []
    rows.push(row)
    galleriesByProduct.set(String(row.product_id), rows)
  }
}
for (const [productId, placements] of galleriesByProduct) {
  if (placements.length > 50) violations.push(`Product ${productId} gallery exceeds 50 assets`)
  const assetSet = new Set()
  const orderSet = new Set()
  placements.forEach((placement, index) => {
    const order = Number(placement.sort_order)
    if (assetSet.has(String(placement.asset_id))) violations.push(`Product ${productId} has duplicate gallery asset ${placement.asset_id}`)
    if (orderSet.has(order)) violations.push(`Product ${productId} has duplicate gallery sort_order ${order}`)
    if (order < 0 || order !== index) violations.push(`Product ${productId} gallery ordering is not dense from zero`)
    assetSet.add(String(placement.asset_id))
    orderSet.add(order)
  })
}

for (const [name, actual] of Object.entries(checks)) {
  const wanted = expected.checksums?.[name]
  if (!wanted || wanted.count !== actual.count || wanted.sha256 !== actual.sha256) {
    violations.push(`${name} checksum mismatch: expected ${JSON.stringify(wanted)}, actual ${JSON.stringify(actual)}`)
  }
}

const legacyPlacements = query(`SELECT id FROM media_placements WHERE owner_type = 'menu_item' LIMIT 50`)
if (legacyPlacements.length) violations.push(`menu_item placements remain: ${legacyPlacements.map(row => row.id).join(', ')}`)
const invalidPlacementScope = query(`
  SELECT mp.id
    FROM media_placements mp
    LEFT JOIN products p ON p.id = mp.owner_id
   WHERE mp.owner_type = 'product'
     AND (p.id IS NULL OR p.organization_id <> mp.organization_id OR p.site_id <> mp.site_id)
   ORDER BY mp.id LIMIT 100
`)
if (invalidPlacementScope.length) violations.push(`Product placement ownership mismatch: ${invalidPlacementScope.map(row => row.id).join(', ')}`)
const invalidReviewScope = query(`
  SELECT r.id
    FROM reviews r
    LEFT JOIN products p ON p.id = r.product_id
   WHERE r.product_id IS NOT NULL
     AND (p.id IS NULL OR p.organization_id <> r.organization_id OR p.site_id <> r.site_id OR p.location_id <> r.location_id)
   ORDER BY r.id LIMIT 100
`)
if (invalidReviewScope.length) violations.push(`Product review ownership mismatch: ${invalidReviewScope.map(row => row.id).join(', ')}`)

const duplicateSlugs = query(`SELECT site_id, location_id, slug, COUNT(*) AS count FROM products GROUP BY site_id, location_id, slug HAVING COUNT(*) > 1`)
if (duplicateSlugs.length) violations.push('duplicate Product slugs remain')
const orderingRows = query(`SELECT site_id, location_id, sort_order FROM products ORDER BY site_id, location_id, sort_order`)
const orderGroups = new Map()
for (const row of orderingRows) {
  const key = `${row.site_id}/${row.location_id}`
  const values = orderGroups.get(key) ?? []
  values.push(Number(row.sort_order)); orderGroups.set(key, values)
}
for (const [key, orders] of orderGroups) if (orders.some((order, index) => order !== index)) violations.push(`Product ordering is not dense for ${key}`)

for (const table of ['sites', 'business_locations']) {
  const stale = query(`SELECT id FROM ${table} WHERE feature_overrides LIKE '%"menu"%' ORDER BY id LIMIT 100`)
  if (stale.length) violations.push(`${table} retains menu feature IDs: ${stale.map(row => row.id).join(', ')}`)
}
const staleDrafts = query(`SELECT id FROM onboarding_drafts WHERE json_type(payload_json, '$.preview.menu') IS NOT NULL ORDER BY id LIMIT 100`)
if (staleDrafts.length) violations.push(`onboarding drafts retain preview.menu: ${staleDrafts.map(row => row.id).join(', ')}`)

const invalidCurrencies = query(`SELECT id, default_currency FROM sites ORDER BY id`)
  .filter(row => !SUPPORTED_CURRENCIES.has(String(row.default_currency ?? '')))
if (invalidCurrencies.length) violations.push(`sites have invalid default_currency values: ${invalidCurrencies.map(row => row.id).join(', ')}`)

const foreignKeyFailures = query(`PRAGMA foreign_key_check`)
if (foreignKeyFailures.length) violations.push(`PRAGMA foreign_key_check returned ${foreignKeyFailures.length} row(s)`)
const potteryLocations = query(`SELECT id FROM business_locations WHERE site_id = 'site-pottery-house' ORDER BY id`).map(row => String(row.id))
for (const required of ['loc-pottery-house', 'loc-pottery-beachfront']) if (!potteryLocations.includes(required)) violations.push(`Pottery House location missing: ${required}`)

const assetById = new Map(assets.map(asset => [String(asset.id), asset]))
const mediaLocationKeys = [...new Set(products.map(product => `${product.site_id}/${product.location_id}`))].sort()
function mediaChecksumsForLocation(key) {
  const [siteId, locationId] = key.split('/')
  const productIds = new Set(products.filter(product => product.site_id === siteId && product.location_id === locationId).map(product => product.id))
  const scopedGallery = gallery.filter(row => productIds.has(row.product_id))
  const scopedAssetIds = [...new Set(scopedGallery.map(row => row.asset_id))].sort()
  return {
    gallery: checksum(scopedGallery),
    assets: checksum(scopedAssetIds.map(assetId => assetById.get(assetId)).filter(Boolean)),
    primary: checksum(primary.filter(row => productIds.has(row.product_id))),
  }
}
const mediaBySiteLocation = Object.fromEntries(mediaLocationKeys.map(key => [key, mediaChecksumsForLocation(key)]))
if (JSON.stringify(mediaBySiteLocation) !== JSON.stringify(expected.media_by_site_location ?? {})) {
  violations.push('site/location media counts or checksums do not match preflight')
}
const kikuzukiByLocation = Object.fromEntries([...new Set(products.filter(row => row.site_id === 'site-kikuzuki').map(row => row.location_id))].sort().map(locationId => [locationId, {
  products: checksum(products.filter(row => row.site_id === 'site-kikuzuki' && row.location_id === locationId)),
  ...mediaChecksumsForLocation(`site-kikuzuki/${locationId}`),
}]))
if (JSON.stringify(kikuzukiByLocation) !== JSON.stringify(expected.kikuzuki_by_location ?? {})) {
  violations.push('Kikuzuki per-location counts or checksums do not match preflight')
}

const report = {
  kind: 'product-migration-postflight',
  generated_at: new Date().toISOString(),
  target: { database: target.database, environment: target.environment ?? 'local', mode: target.local ? 'local' : 'remote' },
  preflight_generated_at: expected.generated_at,
  ok: violations.length === 0,
  violations,
  checksums: checks,
  media_by_site_location: mediaBySiteLocation,
  kikuzuki_by_location: kikuzukiByLocation,
  foreign_key_check_count: foreignKeyFailures.length,
}
emitReport(report, target.output)
if (!report.ok) process.exitCode = 1
