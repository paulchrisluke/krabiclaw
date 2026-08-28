#!/usr/bin/env node
import {
  SUPPORTED_CURRENCIES,
  checksum,
  createD1Query,
  emitReport,
  isCanonicalSlug,
  isDateOnly,
  normalizeDecimal,
  parseJson,
  parseMigrationTarget,
} from './utils/product-migration-report.mjs'

const target = parseMigrationTarget(process.argv.slice(2))
const query = createD1Query(target)
const violations = []

const tables = new Set(query(`SELECT name FROM sqlite_master WHERE type = 'table'`).map(row => String(row.name)))
for (const required of ['menus', 'menu_items', 'media_assets', 'media_placements', 'business_locations', 'sites', 'reviews', 'onboarding_drafts']) {
  if (!tables.has(required)) violations.push(`missing required pre-migration table: ${required}`)
}
if (tables.has('products')) violations.push('unexpected pre-existing products table')

const siteColumns = query(`PRAGMA table_info('sites')`)
const defaultCurrencyColumn = siteColumns.find(column => column.name === 'default_currency')
if (!defaultCurrencyColumn || Number(defaultCurrencyColumn.notnull) !== 1) {
  violations.push('sites.default_currency must already be enforced as NOT NULL')
}

const menuRows = query(`
  SELECT m.id, m.organization_id, m.site_id, m.location_id, m.name, m.description,
         m.is_visible, m.section_order, m.seo_title, m.seo_description, m.canonical_url,
         m.robots, l.title AS location_title
    FROM menus m
    LEFT JOIN business_locations l ON l.id = m.location_id
   ORDER BY m.id
`)
const menuById = new Map(menuRows.map(row => [String(row.id), row]))
const menusByLocation = new Map()
for (const menu of menuRows) {
  const id = String(menu.id)
  if (!menu.location_id) violations.push(`menu ${id}: location_id is null`)
  if (!menu.location_title) violations.push(`menu ${id}: owning location is missing or out of scope`)
  const locationKey = `${menu.organization_id}/${menu.site_id}/${menu.location_id}`
  menusByLocation.set(locationKey, [...(menusByLocation.get(locationKey) ?? []), id])
  if (String(menu.description ?? '').trim()) violations.push(`menu ${id}: non-empty description has no Product target`)
  for (const field of ['seo_title', 'seo_description', 'canonical_url', 'robots']) {
    if (menu[field] !== null) violations.push(`menu ${id}: ${field} must be null before migration`)
  }
  const normalizeTitle = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
  if (normalizeTitle(menu.name) !== normalizeTitle(menu.location_title)) {
    violations.push(`menu ${id}: name is not the normalized owning location title`)
  }
}
for (const [scope, ids] of menusByLocation) {
  if (ids.length > 1) violations.push(`location ${scope}: multiple menus (${ids.join(', ')})`)
}

const sourceRows = query(`
  SELECT mi.*, m.organization_id, m.site_id, m.location_id, m.is_visible, m.section_order
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
   ORDER BY mi.id
`)

function stringArray(value, label) {
  if (value === null) return []
  const parsed = parseJson(value, label, violations)
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string' || !item.trim())) {
    violations.push(`${label}: must be a JSON array of non-empty strings`)
    return []
  }
  return parsed.map(item => item.trim())
}

const menuCategoryOrders = new Map()
for (const menu of menuRows) {
  const parsed = parseJson(menu.section_order, `menu ${menu.id} section_order`, violations)
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string' || !item.trim())) {
    violations.push(`menu ${menu.id}: section_order must be a non-empty string array`)
    menuCategoryOrders.set(String(menu.id), [])
    continue
  }
  const categories = parsed.map(item => item.trim())
  if (new Set(categories).size !== categories.length) violations.push(`menu ${menu.id}: duplicate section_order entries`)
  const actual = [...new Set(sourceRows.filter(row => row.menu_id === menu.id).map(row => String(row.section).trim()))]
  for (const category of actual) if (!categories.includes(category)) violations.push(`menu ${menu.id}: category missing from section_order: ${category}`)
  for (const category of categories) if (!actual.includes(category)) violations.push(`menu ${menu.id}: section_order entry has no Product: ${category}`)
  menuCategoryOrders.set(String(menu.id), categories)
}

const productRows = []
for (const row of sourceRows) {
  const id = String(row.id)
  const category = String(row.section ?? '').trim()
  const name = String(row.name ?? '').trim()
  const slug = String(row.slug ?? '').trim()
  if (!category) violations.push(`menu item ${id}: blank category`)
  if (!name) violations.push(`menu item ${id}: blank name`)
  if (!isCanonicalSlug(slug)) violations.push(`menu item ${id}: non-canonical slug`)
  const priceAmount = normalizeDecimal(row.price_amount)
  if (priceAmount === null) violations.push(`menu item ${id}: invalid required price_amount`)
  const compareAt = row.compare_at_price_amount === null ? null : normalizeDecimal(row.compare_at_price_amount)
  if (row.compare_at_price_amount !== null && compareAt === null) violations.push(`menu item ${id}: invalid compare_at_price_amount`)
  if (compareAt !== null && priceAmount !== null && Number(compareAt) <= Number(priceAmount)) violations.push(`menu item ${id}: compare-at price is not greater than price`)
  for (const field of ['sale_starts_at', 'sale_ends_at']) {
    if (row[field] !== null && !isDateOnly(row[field])) violations.push(`menu item ${id}: invalid ${field}`)
  }
  if ((row.sale_starts_at !== null || row.sale_ends_at !== null) && compareAt === null) violations.push(`menu item ${id}: sale date without compare-at price`)
  if (row.sale_starts_at && row.sale_ends_at && row.sale_ends_at < row.sale_starts_at) violations.push(`menu item ${id}: sale end precedes start`)
  for (const field of ['available', 'featured']) if (![0, 1].includes(Number(row[field]))) violations.push(`menu item ${id}: invalid ${field}`)
  for (const field of ['sort_order', 'featured_sort_order']) if (!Number.isInteger(Number(row[field])) || Number(row[field]) < 0) violations.push(`menu item ${id}: invalid ${field}`)
  if (!['manual', 'template'].includes(String(row.source))) violations.push(`menu item ${id}: invalid source`)
  if (!row.created_at || !row.updated_at) violations.push(`menu item ${id}: null audit timestamp`)
  if (!String(row.created_by ?? '').trim()) violations.push(`menu item ${id}: blank created actor`)
  const allergens = stringArray(row.allergens, `menu item ${id} allergens`)
  const ingredients = stringArray(row.ingredients, `menu item ${id} ingredients`)
  const tags = stringArray(row.dietary_notes, `menu item ${id} dietary_notes`)
  const details = []
  if (allergens.length) details.push({ key: 'allergens', label: 'Allergens', values: allergens })
  if (ingredients.length) details.push({ key: 'ingredients', label: 'Ingredients', values: ingredients })
  if (row.preparation !== null) {
    const value = String(row.preparation).trim()
    if (!value) violations.push(`menu item ${id}: blank preparation`)
    else details.push({ key: 'preparation', label: 'Preparation', values: [value] })
  }
  if (row.serving_note !== null) {
    const value = String(row.serving_note).trim()
    if (!value) violations.push(`menu item ${id}: blank serving_note`)
    else details.push({ key: 'serving', label: 'Serving', values: [value] })
  }
  productRows.push({
    id,
    organization_id: String(row.organization_id),
    site_id: String(row.site_id),
    location_id: String(row.location_id),
    category,
    name,
    slug,
    description: String(row.description ?? ''),
    price_amount: priceAmount,
    compare_at_price_amount: compareAt,
    sale_starts_at: row.sale_starts_at,
    sale_ends_at: row.sale_ends_at,
    order_url: null,
    is_visible: Number(row.is_visible),
    available: Number(row.available),
    featured: Number(row.featured),
    featured_sort_order: Number(row.featured_sort_order),
    old_sort_order: Number(row.sort_order),
    tags,
    details,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    canonical_url: row.canonical_url,
    robots: row.robots,
    source: String(row.source),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: String(row.created_by || 'migration:menu-to-products'),
    updated_by: String(row.updated_by || row.created_by || 'migration:menu-to-products'),
  })
}

for (const menu of menuRows) {
  const rows = productRows.filter(row => sourceRows.find(source => source.id === row.id)?.menu_id === menu.id)
  const categoryOrder = menuCategoryOrders.get(String(menu.id)) ?? []
  rows.sort((left, right) => categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category)
    || left.old_sort_order - right.old_sort_order
    || left.name.trim().toLocaleLowerCase('en-US').localeCompare(right.name.trim().toLocaleLowerCase('en-US'))
    || left.id.localeCompare(right.id))
  rows.forEach((row, sort_order) => { row.sort_order = sort_order; delete row.old_sort_order })
}

const slugKeys = new Map()
for (const product of productRows) {
  const key = `${product.site_id}/${product.location_id}/${product.slug}`
  slugKeys.set(key, [...(slugKeys.get(key) ?? []), product.id])
}
for (const [key, ids] of slugKeys) if (ids.length > 1) violations.push(`duplicate Product slug ${key}: ${ids.join(', ')}`)

const currencyRows = query(`SELECT id, default_currency FROM sites ORDER BY id`)
for (const site of currencyRows) {
  if (!SUPPORTED_CURRENCIES.has(String(site.default_currency ?? ''))) {
    violations.push(`site ${site.id}: invalid default_currency`)
  }
}

const reviewRows = query(`SELECT id, organization_id, site_id, location_id, menu_item_slug, created_at FROM reviews WHERE menu_item_slug IS NOT NULL ORDER BY id`)
const expectedReviews = []
for (const review of reviewRows) {
  const matches = productRows.filter(product => product.slug === review.menu_item_slug
    && (review.site_id === null || product.site_id === review.site_id)
    && (review.location_id === null || product.location_id === review.location_id))
  if (matches.length !== 1) {
    violations.push(`review ${review.id}: Product match count is ${matches.length}`)
    continue
  }
  const product = matches[0]
  expectedReviews.push({ id: String(review.id), product_id: product.id, organization_id: product.organization_id, site_id: product.site_id, location_id: product.location_id, created_at: review.created_at })
}

function validateFeatureOverrides(table, id, raw) {
  if (raw === null) return
  const parsed = parseJson(raw, `${table} ${id} feature_overrides`, violations)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { violations.push(`${table} ${id}: feature_overrides root must be an object`); return }
  const allowed = new Set(['products', 'menu', 'ordering', 'reservations', 'experiences', 'services'])
  const normalized = {}
  for (const field of ['enabled', 'disabled']) {
    const values = parsed[field] ?? []
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !allowed.has(value))) { violations.push(`${table} ${id}: invalid ${field} feature array`); continue }
    const mapped = values.map(value => value === 'menu' ? 'products' : value)
    if (new Set(mapped).size !== mapped.length) violations.push(`${table} ${id}: duplicate ${field} feature after Product mapping`)
    normalized[field] = new Set(mapped)
  }
  for (const value of normalized.enabled ?? []) if (normalized.disabled?.has(value)) violations.push(`${table} ${id}: enabled/disabled feature conflict for ${value}`)
}
for (const table of ['sites', 'business_locations']) {
  for (const row of query(`SELECT id, feature_overrides FROM ${table} WHERE feature_overrides IS NOT NULL ORDER BY id`)) validateFeatureOverrides(table, row.id, row.feature_overrides)
}

const draftRows = query(`SELECT id, status, payload_json FROM onboarding_drafts WHERE status IN ('active', 'committing') ORDER BY id`)
for (const draft of draftRows) {
  const payload = parseJson(draft.payload_json, `draft ${draft.id}`, violations)
  const menu = payload?.preview?.menu
  if (menu === null || menu === undefined) continue
  const locations = payload?.preview?.locations
  const primary = Array.isArray(locations) ? locations.filter(location => location?.is_primary === true) : []
  if (primary.length !== 1) violations.push(`draft ${draft.id}: Product conversion requires exactly one primary location`)
  if (!Array.isArray(menu.items)) violations.push(`draft ${draft.id}: preview.menu.items must be an array`)
  if (primary.length === 1 && String(menu.name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') !== String(primary[0].title ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')) {
    violations.push(`draft ${draft.id}: menu name is not the normalized primary location title`)
  }
}

const placementColumns = new Set(query(`PRAGMA table_info(menu_items)`).map(row => String(row.name)))
if (placementColumns.has('image_asset_id')) violations.push('menu_items.image_asset_id must not exist in the deployed schema')
const galleryRows = query(`
  SELECT mp.id AS placement_id, mp.organization_id, mp.site_id, m.location_id,
         mp.owner_id AS product_id, mp.asset_id, mp.sort_order, mp.status,
         mp.created_at, mp.updated_at, ma.status AS asset_status, ma.kind,
         ma.public_url, ma.thumbnail_url, ma.organization_id AS asset_organization_id,
         ma.site_id AS asset_site_id
    FROM media_placements mp
    LEFT JOIN menu_items mi ON mi.id = mp.owner_id
    LEFT JOIN menus m ON m.id = mi.menu_id
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id
   WHERE mp.owner_type = 'menu_item'
   ORDER BY mp.owner_id, mp.sort_order, mp.id
`)
const unexpectedProductPlacements = query(`SELECT id FROM media_placements WHERE owner_type = 'product' LIMIT 50`)
if (unexpectedProductPlacements.length) violations.push(`unexpected pre-existing product placements: ${unexpectedProductPlacements.map(row => row.id).join(', ')}`)
const galleriesByProduct = new Map()
for (const row of galleryRows) {
  if (!menuById.has(String(sourceRows.find(item => item.id === row.product_id)?.menu_id))) violations.push(`placement ${row.placement_id}: missing MenuItem owner`)
  if (!row.asset_status) violations.push(`placement ${row.placement_id}: missing media asset`)
  if (row.organization_id !== row.asset_organization_id || row.site_id !== row.asset_site_id) violations.push(`placement ${row.placement_id}: media asset scope mismatch`)
  if (row.location_id === null) violations.push(`placement ${row.placement_id}: Product location is missing`)
  const owner = productRows.find(product => product.id === row.product_id)
  if (!owner || owner.organization_id !== row.organization_id || owner.site_id !== row.site_id) violations.push(`placement ${row.placement_id}: owner scope mismatch`)
  const values = galleriesByProduct.get(String(row.product_id)) ?? []
  values.push(row)
  galleriesByProduct.set(String(row.product_id), values)
}
const unsupportedMenuPlacements = query(`SELECT id, slot FROM media_placements WHERE owner_type = 'menu_item' AND slot <> 'gallery' ORDER BY id`)
for (const row of unsupportedMenuPlacements) violations.push(`placement ${row.id}: unsupported MenuItem slot ${row.slot}`)
for (const [productId, rows] of galleriesByProduct) {
  if (rows.length > 50) violations.push(`Product ${productId}: gallery exceeds 50 assets`)
  const assets = new Set(), orders = new Set()
  rows.forEach((row, index) => {
    if (assets.has(row.asset_id)) violations.push(`Product ${productId}: duplicate gallery asset ${row.asset_id}`)
    if (orders.has(Number(row.sort_order))) violations.push(`Product ${productId}: duplicate gallery sort_order ${row.sort_order}`)
    if (Number(row.sort_order) !== index || Number(row.sort_order) < 0) violations.push(`Product ${productId}: gallery ordering is not dense from zero`)
    assets.add(row.asset_id); orders.add(Number(row.sort_order))
    const renderable = row.kind === 'image' ? Boolean(String(row.public_url ?? '').trim()) : row.kind === 'video' ? Boolean(String(row.public_url ?? '').trim() && String(row.thumbnail_url ?? '').trim()) : false
    if (row.status === 'active' && (row.asset_status !== 'active' || !renderable)) violations.push(`placement ${row.placement_id}: active placement references inactive or unrenderable asset`)
  })
}

const normalizedGallery = galleryRows.map(row => ({ placement_id: String(row.placement_id), organization_id: String(row.organization_id), site_id: String(row.site_id), product_id: String(row.product_id), asset_id: String(row.asset_id), sort_order: Number(row.sort_order), status: String(row.status), created_at: String(row.created_at), updated_at: String(row.updated_at) }))
const referencedAssetIds = [...new Set(galleryRows.map(row => String(row.asset_id)))].sort()
const referencedAssets = referencedAssetIds.length ? query(`SELECT * FROM media_assets WHERE id IN (${referencedAssetIds.map(id => `'${id.replaceAll("'", "''")}'`).join(',')}) ORDER BY id`) : []
if (referencedAssets.length !== referencedAssetIds.length) violations.push('one or more referenced media assets are missing')
const primaryImages = []
const existingPlacementIds = new Set(query(`SELECT id FROM media_placements ORDER BY id`).map(row => String(row.id)))
for (const product of productRows) {
  const first = (galleriesByProduct.get(product.id) ?? []).find(row => {
    const renderable = row.kind === 'image' ? Boolean(String(row.public_url ?? '').trim()) : row.kind === 'video' ? Boolean(String(row.public_url ?? '').trim() && String(row.thumbnail_url ?? '').trim()) : false
    return row.status === 'active' && row.asset_status === 'active' && renderable
  })
  if (first) {
    const futurePlacementId = `product-image-${first.placement_id}`
    if (existingPlacementIds.has(futurePlacementId)) {
      violations.push(`placement ${first.placement_id}: generated primary placement ID collides with ${futurePlacementId}`)
    }
    primaryImages.push({ organization_id: product.organization_id, site_id: product.site_id, product_id: product.id, asset_id: String(first.asset_id) })
  }
}

const identity = productRows.map(({ id, site_id, location_id, slug }) => ({ id, site_id, location_id, slug }))
const core = productRows.map(({ id, organization_id, site_id, location_id, category, name, slug, description, tags, details, seo_title, seo_description, canonical_url, robots }) => ({ id, organization_id, site_id, location_id, category, name, slug, description, tags, details, seo_title, seo_description, canonical_url, robots }))
const prices = productRows.map(({ id, price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url }) => ({ id, price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url }))
const visibility = productRows.map(({ id, is_visible, available, featured, featured_sort_order }) => ({ id, is_visible, available, featured, featured_sort_order }))
const ordering = productRows.map(({ id, site_id, location_id, category, sort_order }) => ({ id, site_id, location_id, category, sort_order }))
const audit = productRows.map(({ id, source, created_at, updated_at, created_by, updated_by }) => ({ id, source, created_at, updated_at, created_by, updated_by }))
const assetById = new Map(referencedAssets.map(asset => [String(asset.id), asset]))
const mediaLocationKeys = [...new Set(productRows.map(product => `${product.site_id}/${product.location_id}`))].sort()
function mediaChecksumsForLocation(key) {
  const [siteId, locationId] = key.split('/')
  const productIds = new Set(productRows.filter(product => product.site_id === siteId && product.location_id === locationId).map(product => product.id))
  const gallery = normalizedGallery.filter(row => productIds.has(row.product_id))
  const assetIds = [...new Set(gallery.map(row => row.asset_id))].sort()
  return {
    gallery: checksum(gallery),
    assets: checksum(assetIds.map(assetId => assetById.get(assetId)).filter(Boolean)),
    primary: checksum(primaryImages.filter(row => productIds.has(row.product_id))),
  }
}
const mediaBySiteLocation = Object.fromEntries(mediaLocationKeys.map(key => [key, mediaChecksumsForLocation(key)]))
const report = {
  kind: 'product-migration-preflight',
  generated_at: new Date().toISOString(),
  target: { database: target.database, environment: target.environment ?? 'local', mode: target.local ? 'local' : 'remote' },
  ok: violations.length === 0,
  violations,
  checksums: {
    product_ids: checksum(productRows.map(row => ({ id: row.id }))),
    product_identity: checksum(identity),
    product_core: checksum(core),
    product_prices: checksum(prices),
    product_visibility: checksum(visibility),
    product_ordering: checksum(ordering),
    product_audit: checksum(audit),
    product_reviews: checksum(expectedReviews),
    media_gallery: checksum(normalizedGallery),
    media_assets: checksum(referencedAssets),
    media_primary: checksum(primaryImages),
  },
  media_by_site_location: mediaBySiteLocation,
  kikuzuki_by_location: Object.fromEntries([...new Set(productRows.filter(row => row.site_id === 'site-kikuzuki').map(row => row.location_id))].sort().map(locationId => [locationId, {
    products: checksum(productRows.filter(row => row.site_id === 'site-kikuzuki' && row.location_id === locationId)),
    ...mediaChecksumsForLocation(`site-kikuzuki/${locationId}`),
  }])),
}

emitReport(report, target.output)
if (!report.ok) process.exitCode = 1
