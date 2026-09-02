import { HTTPError } from 'nitro'
import type { CloudflareEnv } from '~/server/utils/auth'
import { d1JsonArray, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import type {
  CreateProductInput,
  Product,
  ProductDetail,
  ProductSource,
  SyncProductInput,
  UpdateProductInput,
} from '~/server/types/products'
import { refreshSocialCard } from '~/server/utils/social-card'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { hydrateOrderingCatalog, replaceProductModifierQueries } from '~/server/utils/ordering-catalog'
import { fireOrganizationEventSafe, type OrganizationEventType } from '~/server/utils/organization-events'
import { isCurrencyCode } from '~/shared/currencies'
import { PRICE_TAX_BEHAVIORS, PRICE_UNITS, type Price, type PriceInput } from '~/shared/prices'
import {
  PRODUCT_LIMITS,
  normalizeOptionalProductString,
  requireTrimmedProductString,
  validateProductCanonicalUrl,
  validateProductDetails,
  validateProductOrderUrl,
  validateProductRobots,
  validateProductTags,
} from '~/server/utils/product-validation'

const MAX_SLUG_SUFFIX_ATTEMPTS = 100
const REORDER_OFFSET = 1_000_000

type ProductRow = Record<string, unknown>
type SqlValue = string | number | boolean | null

function notFound(): never {
  throw new HTTPError({ statusCode: 404, statusMessage: 'Product not found' })
}

function parseJsonArray<T>(value: unknown, field: string): T[] {
  if (typeof value !== 'string') throw new Error(`Product ${field} is not stored as JSON`)
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error(`Product ${field} must be a JSON array`)
  return parsed as T[]
}

export function mapProduct(row: ProductRow): Product {
  const price = row.price_id === null || row.price_id === undefined ? null : mapPrice(row)
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    site_id: String(row.site_id),
    location_id: String(row.location_id),
    product_type: String(row.product_type) as Product['product_type'],
    category: String(row.category),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description),
    price,
    order_url: row.order_url === null ? null : String(row.order_url),
    is_visible: Number(row.is_visible) === 1,
    available: Number(row.available) === 1,
    featured: Number(row.featured) === 1,
    featured_sort_order: Number(row.featured_sort_order),
    sort_order: Number(row.sort_order),
    tags: parseJsonArray<string>(row.tags_json, 'tags_json'),
    details: parseJsonArray<ProductDetail>(row.details_json, 'details_json'),
    image: null,
    gallery: [],
    media: [],
    social_image: null,
    seo_title: row.seo_title === null ? null : String(row.seo_title),
    seo_description: row.seo_description === null ? null : String(row.seo_description),
    canonical_url: row.canonical_url === null ? null : String(row.canonical_url),
    robots: row.robots === null ? null : String(row.robots),
    source: String(row.source) as ProductSource,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: String(row.created_by),
    updated_by: String(row.updated_by),
    menu_placement: null,
    channel_availability: [],
    modifier_groups: [],
    provider_mappings: [],
  }
}

const PRODUCT_COLUMNS = `
  p.id, p.organization_id, p.site_id, p.location_id, p.product_type, p.category, p.name, p.slug, p.description,
  p.order_url,
  is_visible, available, featured, featured_sort_order, sort_order, tags_json,
  details_json, seo_title, seo_description, canonical_url, robots, source,
  p.created_at, p.updated_at, p.created_by, p.updated_by,
  pr.id AS price_id, pr.amount_minor, pr.currency, pr.unit, pr.tax_behavior,
  pr.compare_at_amount_minor, pr.valid_from, pr.valid_until, pr.provenance,
  pr.created_by AS price_created_by, pr.created_at AS price_created_at
`

const ACTIVE_PRICE_JOIN = `
  LEFT JOIN prices pr ON pr.id = (
    SELECT candidate.id FROM prices candidate
    WHERE candidate.organization_id = p.organization_id
      AND candidate.site_id = p.site_id
      AND candidate.location_id = p.location_id
      AND candidate.product_id = p.id
      AND candidate.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND (candidate.valid_until IS NULL OR candidate.valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ORDER BY candidate.valid_from DESC LIMIT 1
  )
`

function mapPrice(row: ProductRow): Price {
  return {
    id: String(row.price_id), organization_id: String(row.organization_id), site_id: String(row.site_id),
    location_id: String(row.location_id), product_id: String(row.id), amount_minor: Number(row.amount_minor),
    currency: String(row.currency) as Price['currency'], unit: String(row.unit) as Price['unit'],
    tax_behavior: String(row.tax_behavior) as Price['tax_behavior'],
    compare_at_amount_minor: row.compare_at_amount_minor === null ? null : Number(row.compare_at_amount_minor),
    valid_from: String(row.valid_from), valid_until: row.valid_until === null ? null : String(row.valid_until),
    provenance: String(row.provenance), created_by: String(row.price_created_by), created_at: String(row.price_created_at),
    provider_mappings: [],
  }
}

function normalizePriceInput(input: PriceInput, defaultCurrency: string, field = 'price') {
  if (!input || typeof input !== 'object') throw new HTTPError({ statusCode: 400, statusMessage: `${field} is required` })
  if (!Number.isSafeInteger(input.amount_minor) || input.amount_minor < 0) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.amount_minor must be a non-negative integer` })
  const currency = input.currency ?? defaultCurrency
  if (!isCurrencyCode(currency)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.currency is unsupported` })
  const unit = input.unit ?? 'item'
  if (!(PRICE_UNITS as readonly string[]).includes(unit)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.unit is unsupported` })
  const taxBehavior = input.tax_behavior ?? 'unspecified'
  if (!(PRICE_TAX_BEHAVIORS as readonly string[]).includes(taxBehavior)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.tax_behavior is unsupported` })
  const compareAt = input.compare_at_amount_minor ?? null
  if (compareAt !== null && (!Number.isSafeInteger(compareAt) || compareAt <= input.amount_minor)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.compare_at_amount_minor must exceed amount_minor` })
  const validFrom = input.valid_from ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(validFrom))) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.valid_from must be an ISO instant` })
  const validUntil = input.valid_until ?? null
  if (validUntil !== null && (Number.isNaN(Date.parse(validUntil)) || validUntil <= validFrom)) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field}.valid_until must be an ISO instant after valid_from` })
  }
  return { amountMinor: input.amount_minor, currency, unit, taxBehavior, compareAt, validFrom, validUntil, provenance: input.provenance ?? 'manual' }
}

async function siteDefaultCurrency(db: DbClient, organizationId: string, siteId: string): Promise<string> {
  const site = await queryFirst<{ default_currency: string }>(db, `SELECT default_currency FROM sites WHERE id = ? AND organization_id = ?`, [siteId, organizationId])
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  return site.default_currency
}

async function hydrateProductMedia(db: DbClient, siteId: string, products: Product[]): Promise<Product[]> {
  if (!products.length) return products
  const ownerIds = products.map(product => product.id)
  const placements = await loadPublicSocialMedia(db, siteId, 'product', ownerIds)
  const withMedia = products.map((product) => {
    const socialMedia = placements.get(product.id) ?? { media: [], social_image: null }
    const media = socialMedia.media
    return {
      ...product,
      image: media.find(item => item.slot === 'image') ?? null,
      gallery: media.filter(item => item.slot === 'gallery'),
      media,
      social_image: socialMedia.social_image,
    }
  })
  return hydrateOrderingCatalog(db, withMedia)
}

async function assertLocationOwnership(db: DbClient, organizationId: string, siteId: string, locationId: string): Promise<void> {
  const location = await queryFirst(db, `
    SELECT id FROM business_locations
     WHERE id = ? AND organization_id = ? AND site_id = ?
     LIMIT 1
  `, [locationId, organizationId, siteId])
  if (!location) throw new HTTPError({ statusCode: 404, statusMessage: 'Location not found' })
}

export async function listLocationProducts(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  options: { publicOnly?: boolean } = {},
): Promise<Product[]> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const rows = await queryAll<ProductRow>(db, `
    SELECT ${PRODUCT_COLUMNS}
      FROM products p ${ACTIVE_PRICE_JOIN}
     WHERE p.organization_id = ? AND p.site_id = ? AND p.location_id = ?
       AND p.product_type = 'standard'
       ${options.publicOnly ? 'AND p.is_visible = 1' : ''}
     ORDER BY p.sort_order, p.id
  `, [organizationId, siteId, locationId])
  return hydrateProductMedia(db, siteId, rows.map(mapProduct))
}

export async function listPublicSiteProducts(
  db: DbClient,
  siteId: string,
  locationIds?: string[],
  options: { visibleOnly?: boolean } = {},
): Promise<Product[]> {
  const scoped = locationIds !== undefined
  if (scoped && locationIds.length === 0) return []
  const rows = await queryAll<ProductRow>(db, `
    SELECT ${PRODUCT_COLUMNS}
      FROM products p ${ACTIVE_PRICE_JOIN}
     WHERE p.site_id = ? ${options.visibleOnly === false ? '' : 'AND p.is_visible = 1'}
       AND p.product_type = 'standard'
       ${scoped ? 'AND p.location_id IN (SELECT value FROM json_each(?))' : ''}
     ORDER BY p.location_id, p.sort_order, p.id
  `, [siteId, ...(scoped ? [JSON.stringify([...new Set(locationIds)])] : [])])
  return hydrateProductMedia(db, siteId, rows.map(mapProduct))
}

export async function getProduct(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  productId: string,
): Promise<Product | null> {
  const row = await queryFirst<ProductRow>(db, `
    SELECT ${PRODUCT_COLUMNS}
      FROM products p ${ACTIVE_PRICE_JOIN}
     WHERE p.id = ? AND p.organization_id = ? AND p.site_id = ? AND p.location_id = ?
       AND p.product_type = 'standard'
     LIMIT 1
  `, [productId, organizationId, siteId, locationId])
  if (!row) return null
  const [product] = await hydrateProductMedia(db, siteId, [mapProduct(row)])
  if (!product) return null
  const scheduled = await queryAll<Record<string, unknown>>(db, `
    SELECT id, organization_id, site_id, location_id, product_id, amount_minor, currency,
           unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until,
           provenance, created_by AS price_created_by, created_at AS price_created_at
      FROM prices WHERE product_id = ? AND valid_from > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     ORDER BY valid_from, id
  `, [productId])
  return { ...product, scheduled_prices: scheduled.map(row => ({
    id: String(row.id), organization_id: String(row.organization_id), site_id: String(row.site_id),
    location_id: String(row.location_id), product_id: String(row.product_id), amount_minor: Number(row.amount_minor),
    currency: String(row.currency) as Price['currency'], unit: String(row.unit) as Price['unit'],
    tax_behavior: String(row.tax_behavior) as Price['tax_behavior'],
    compare_at_amount_minor: row.compare_at_amount_minor == null ? null : Number(row.compare_at_amount_minor),
    valid_from: String(row.valid_from), valid_until: row.valid_until == null ? null : String(row.valid_until),
    provenance: String(row.provenance), created_by: String(row.price_created_by), created_at: String(row.price_created_at),
    provider_mappings: [],
  })) }
}

export async function getPublicProductBySlug(
  db: DbClient,
  siteId: string,
  locationId: string,
  productSlug: string,
): Promise<Product | null> {
  const row = await queryFirst<ProductRow>(db, `
    SELECT ${PRODUCT_COLUMNS}
      FROM products p ${ACTIVE_PRICE_JOIN}
     WHERE p.site_id = ? AND p.location_id = ? AND p.slug = ? AND p.is_visible = 1
       AND p.product_type = 'standard'
     LIMIT 1
  `, [siteId, locationId, productSlug])
  if (!row) return null
  const [product] = await hydrateProductMedia(db, siteId, [mapProduct(row)])
  return product ?? null
}

function slugifyProductName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '')
}

export async function createLocationProductSlug(
  db: DbClient,
  siteId: string,
  locationId: string,
  name: string,
): Promise<string> {
  const base = slugifyProductName(name)
  if (!base) throw new HTTPError({ statusCode: 400, statusMessage: 'name must produce a non-empty ASCII slug' })
  for (let suffix = 1; suffix <= MAX_SLUG_SUFFIX_ATTEMPTS; suffix += 1) {
    const suffixText = suffix === 1 ? '' : `-${suffix}`
    const candidate = `${base.slice(0, 120 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
    const existing = await queryFirst(db, `
      SELECT id FROM products WHERE site_id = ? AND location_id = ? AND slug = ? LIMIT 1
    `, [siteId, locationId, candidate])
    if (!existing) return candidate
  }
  throw new HTTPError({ statusCode: 409, statusMessage: `Unable to create a unique Product slug in this location` })
}

function validateSource(source: ProductSource | undefined): ProductSource {
  const value = source ?? 'manual'
  if (!['manual', 'template', 'ai', 'import', 'copy'].includes(value)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Invalid Product source' })
  }
  return value
}

function validateNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be a non-negative integer` })
  }
  return value
}

function validateOptionalBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be a boolean` })
  return value
}

function validateChannelAvailability(
  value: unknown,
  field: string,
  fallback: { seo: boolean; ordering: boolean },
): { seo: boolean; ordering: boolean } {
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be an object` })
  }
  const channels = value as { seo?: unknown; ordering?: unknown } | undefined
  return {
    seo: validateOptionalBoolean(channels?.seo, `${field}.seo`, fallback.seo),
    ordering: validateOptionalBoolean(channels?.ordering, `${field}.ordering`, fallback.ordering),
  }
}

function productEvent(
  db: DbClient,
  eventType: OrganizationEventType,
  input: { organizationId: string; siteId: string; locationId: string; actor: string; productId?: string; metadata?: Record<string, unknown> },
) {
  return fireOrganizationEventSafe({
    db,
    organizationId: input.organizationId,
    siteId: input.siteId,
    locationId: input.locationId,
    actorId: input.actor,
    eventType,
    entityType: 'product',
    entityId: input.productId,
    metadata: input.metadata,
  })
}

export async function createProduct(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  input: CreateProductInput,
  actor: string,
  env: CloudflareEnv,
): Promise<Product> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const category = requireTrimmedProductString(input.category, 'category', PRODUCT_LIMITS.category)
  const name = requireTrimmedProductString(input.name, 'name', PRODUCT_LIMITS.name)
  if (input.description !== undefined && typeof input.description !== 'string') {
    throw new HTTPError({ statusCode: 400, statusMessage: 'description must be a string' })
  }
  const description = input.description?.trim() ?? ''
  if (description.length > PRODUCT_LIMITS.description) {
    throw new HTTPError({ statusCode: 400, statusMessage: `description must be at most ${PRODUCT_LIMITS.description} characters` })
  }
  const price = normalizePriceInput(input.price, await siteDefaultCurrency(db, organizationId, siteId))
  const orderUrl = validateProductOrderUrl(input.order_url)
  const tags = validateProductTags(input.tags)
  const details = validateProductDetails(input.details)
  const seoTitle = normalizeOptionalProductString(input.seo_title, 'seo_title', PRODUCT_LIMITS.seoTitle)
  const seoDescription = normalizeOptionalProductString(input.seo_description, 'seo_description', PRODUCT_LIMITS.seoDescription)
  const canonicalUrl = validateProductCanonicalUrl(input.canonical_url)
  const robots = validateProductRobots(input.robots)
  const source = validateSource(input.source)
  const slug = await createLocationProductSlug(db, siteId, locationId, name)
  const count = await queryFirst<{ count: number }>(db, `
    SELECT COUNT(*) AS count FROM products WHERE site_id = ? AND location_id = ?
  `, [siteId, locationId])
  const productCount = Number(count?.count ?? 0)
  const requestedOrder = input.sort_order === undefined ? productCount : validateNonNegativeInteger(input.sort_order, 'sort_order')
  if (requestedOrder > productCount) throw new HTTPError({ statusCode: 400, statusMessage: 'sort_order must be within the location Product range' })
  const featuredSortOrder = input.featured_sort_order === undefined ? 0 : validateNonNegativeInteger(input.featured_sort_order, 'featured_sort_order')
  const isVisible = validateOptionalBoolean(input.is_visible, 'is_visible', true)
  const isAvailable = validateOptionalBoolean(input.available, 'available', true)
  const isFeatured = validateOptionalBoolean(input.featured, 'featured', false)
  const channelAvailability = validateChannelAvailability(input.channel_availability, 'channel_availability', { seo: isVisible, ordering: isAvailable })
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const insert: BatchQuery = {
    query: `INSERT INTO products (
      id, organization_id, site_id, location_id, product_type, category, name, slug, description, order_url,
      is_visible, available, featured, featured_sort_order, sort_order, tags_json,
      details_json, seo_title, seo_description, canonical_url, robots, source,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id, organizationId, siteId, locationId, category, name, slug, description,
      orderUrl,
      isVisible,
      isAvailable,
      isFeatured,
      featuredSortOrder, requestedOrder, JSON.stringify(tags), JSON.stringify(details),
      seoTitle, seoDescription, canonicalUrl, robots, source, now, now, actor, actor,
    ],
  }
  const insertPrice: BatchQuery = {
    query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
  }
  const insertPlacement: BatchQuery = {
    query: `INSERT INTO product_menu_placements (id, organization_id, site_id, location_id, product_id, section, sort_order, is_published, featured, featured_sort_order, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), organizationId, siteId, locationId, id, category, requestedOrder, isVisible, isFeatured, featuredSortOrder, now, now, actor, actor],
  }
  const insertChannels: BatchQuery = {
    query: `INSERT INTO product_channel_availability (id, organization_id, site_id, location_id, product_id, channel, is_available, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 'seo', ?, ?, ?, ?), (?, ?, ?, ?, ?, 'ordering', ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), organizationId, siteId, locationId, id, channelAvailability.seo, now, now, actor, crypto.randomUUID(), organizationId, siteId, locationId, id, channelAvailability.ordering, now, now, actor],
  }
  const queries: BatchQuery[] = requestedOrder === productCount
    ? [insert, insertPrice, insertPlacement, insertChannels]
    : [
        { query: `UPDATE products SET sort_order = sort_order + ? WHERE site_id = ? AND location_id = ? AND product_type = 'standard'`, params: [REORDER_OFFSET, siteId, locationId] },
        insert,
        insertPrice,
        insertPlacement,
        insertChannels,
        { query: `UPDATE products SET sort_order = (sort_order - ?) + CASE WHEN sort_order - ? >= ? THEN 1 ELSE 0 END WHERE site_id = ? AND location_id = ? AND product_type = 'standard' AND id <> ?`, params: [REORDER_OFFSET, REORDER_OFFSET, requestedOrder, siteId, locationId, id] },
      ]
  if (input.modifier_groups) {
    queries.push(...replaceProductModifierQueries({ organizationId, siteId, locationId, productId: id, modifierGroups: input.modifier_groups, actor, now }))
  }
  queries.push(publicResourceCacheInvalidationQuery(siteId, 'product.created'))
  await executeBatch(db, queries, { operation: 'create Product' })
  await productEvent(db, 'product.created', { organizationId, siteId, locationId, actor, productId: id, metadata: { category, name } })
  const created = await getProduct(db, organizationId, siteId, locationId, id)
  if (!created) throw new Error('Product not found after create')
  await refreshSocialCard({ db, env, owner: { owner_type: 'product', owner_id: id }, actorId: actor })
  return created
}

export async function createProductsBatch(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  inputs: CreateProductInput[],
  actor: string,
): Promise<Product[]> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > PRODUCT_LIMITS.batchCreate) {
    throw new HTTPError({ statusCode: 400, statusMessage: `products must contain between 1 and ${PRODUCT_LIMITS.batchCreate} rows` })
  }
  if (inputs.some(input => input.modifier_groups !== undefined)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Use create_product or update_product to manage modifier groups' })
  }
  const existing = await queryAll<{ slug: string }>(db, `SELECT slug FROM products WHERE site_id = ? AND location_id = ?`, [siteId, locationId])
  const usedSlugs = new Set(existing.map(row => row.slug))
  const now = new Date().toISOString()
  const defaultCurrency = await siteDefaultCurrency(db, organizationId, siteId)
  const ids: string[] = []
  const placementRows: Array<Record<string, unknown>> = []
  const channelRows: Array<Record<string, unknown>> = []
  const inserts: BatchQuery[] = inputs.flatMap((input, index) => {
    const category = requireTrimmedProductString(input.category, `products[${index}].category`, PRODUCT_LIMITS.category)
    const name = requireTrimmedProductString(input.name, `products[${index}].name`, PRODUCT_LIMITS.name)
    if (input.description !== undefined && typeof input.description !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description must be a string` })
    const description = input.description?.trim() ?? ''
    if (description.length > PRODUCT_LIMITS.description) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description is too long` })
    const price = normalizePriceInput(input.price, defaultCurrency, `products[${index}].price`)
    const base = slugifyProductName(name)
    if (!base) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].name must produce a non-empty ASCII slug` })
    let slug = ''
    for (let suffix = 1; suffix <= MAX_SLUG_SUFFIX_ATTEMPTS; suffix += 1) {
      const suffixText = suffix === 1 ? '' : `-${suffix}`
      const candidate = `${base.slice(0, 120 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
      if (!usedSlugs.has(candidate)) { slug = candidate; usedSlugs.add(candidate); break }
    }
    if (!slug) throw new HTTPError({ statusCode: 409, statusMessage: `Unable to create a unique Product slug for products[${index}]` })
    const id = crypto.randomUUID()
    ids.push(id)
    const isVisible = validateOptionalBoolean(input.is_visible, `products[${index}].is_visible`, true)
    const isAvailable = validateOptionalBoolean(input.available, `products[${index}].available`, true)
    const isFeatured = validateOptionalBoolean(input.featured, `products[${index}].featured`, false)
    const channelAvailability = validateChannelAvailability(input.channel_availability, `products[${index}].channel_availability`, { seo: isVisible, ordering: isAvailable })
    const featuredSortOrder = input.featured_sort_order === undefined ? 0 : validateNonNegativeInteger(input.featured_sort_order, `products[${index}].featured_sort_order`)
    placementRows.push({ id: crypto.randomUUID(), product_id: id, section: category, sort_order: existing.length + index, is_published: isVisible, featured: isFeatured, featured_sort_order: featuredSortOrder })
    channelRows.push(
      { id: crypto.randomUUID(), product_id: id, channel: 'seo', is_available: channelAvailability.seo },
      { id: crypto.randomUUID(), product_id: id, channel: 'ordering', is_available: channelAvailability.ordering },
    )
    return [{
      query: `INSERT INTO products (
        id, organization_id, site_id, location_id, product_type, category, name, slug, description, order_url,
        is_visible, available, featured, featured_sort_order, sort_order, tags_json,
        details_json, seo_title, seo_description, canonical_url, robots, source,
        created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id, organizationId, siteId, locationId, category, name, slug, description,
        validateProductOrderUrl(input.order_url),
        isVisible,
        isAvailable,
        isFeatured,
        featuredSortOrder,
        existing.length + index, JSON.stringify(validateProductTags(input.tags)), JSON.stringify(validateProductDetails(input.details)),
        normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
        normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
        validateProductCanonicalUrl(input.canonical_url), validateProductRobots(input.robots), validateSource(input.source),
        now, now, actor, actor,
      ],
    }, {
      query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
    }]
  })
  const catalogInserts: BatchQuery[] = [{
    query: `INSERT INTO product_menu_placements (id, organization_id, site_id, location_id, product_id, section, sort_order, is_published, featured, featured_sort_order, created_at, updated_at, created_by, updated_by)
            SELECT json_extract(value, '$.id'), ?, ?, ?, json_extract(value, '$.product_id'), json_extract(value, '$.section'), json_extract(value, '$.sort_order'), json_extract(value, '$.is_published'), json_extract(value, '$.featured'), json_extract(value, '$.featured_sort_order'), ?, ?, ?, ? FROM json_each(?)`,
    params: [organizationId, siteId, locationId, now, now, actor, actor, JSON.stringify(placementRows)],
  }, {
    query: `INSERT INTO product_channel_availability (id, organization_id, site_id, location_id, product_id, channel, is_available, created_at, updated_at, updated_by)
            SELECT json_extract(value, '$.id'), ?, ?, ?, json_extract(value, '$.product_id'), json_extract(value, '$.channel'), json_extract(value, '$.is_available'), ?, ?, ? FROM json_each(?)`,
    params: [organizationId, siteId, locationId, now, now, actor, JSON.stringify(channelRows)],
  }]
  await executeBatch(db, [...inserts, ...catalogInserts, publicResourceCacheInvalidationQuery(siteId, 'product.batch_created')], { operation: 'batch create Products' })
  await productEvent(db, 'product.created', { organizationId, siteId, locationId, actor, metadata: { product_count: ids.length } })
  const created = await queryAll<ProductRow>(db, `SELECT ${PRODUCT_COLUMNS} FROM products p ${ACTIVE_PRICE_JOIN} WHERE p.site_id = ? AND p.location_id = ? AND p.product_type = 'standard' AND p.id IN (SELECT value FROM json_each(?)) ORDER BY p.sort_order, p.id`, [siteId, locationId, JSON.stringify(ids)])
  return hydrateProductMedia(db, siteId, created.map(mapProduct))
}

export async function syncProducts(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  inputs: SyncProductInput[],
  actor: string,
  setMissingUnavailable = false,
): Promise<Product[]> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  if (!Array.isArray(inputs) || inputs.length > PRODUCT_LIMITS.sync) throw new HTTPError({ statusCode: 400, statusMessage: `products may contain at most ${PRODUCT_LIMITS.sync} rows` })
  if (inputs.some(input => input.modifier_groups !== undefined)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Use update_product to manage modifier groups' })
  }
  const existing = await listLocationProducts(db, organizationId, siteId, locationId)
  const existingById = new Map(existing.map(product => [product.id, product]))
  const requestedIds = inputs.map(input => input.product_id).filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (new Set(requestedIds).size !== requestedIds.length) throw new HTTPError({ statusCode: 400, statusMessage: 'product_id values must be unique' })
  const unknownIds = requestedIds.filter(id => !existingById.has(id))
  if (unknownIds.length > 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: `Product IDs not found at this location: ${unknownIds.join(', ')}` })
  }
  const now = new Date().toISOString()
  const defaultCurrency = await siteDefaultCurrency(db, organizationId, siteId)
  const usedSlugs = new Set(existing.map(product => product.slug))
  const orderedIds: string[] = []
  const writes: BatchQuery[] = []
  const placementRows: Array<Record<string, unknown>> = []
  const channelRows: Array<Record<string, unknown>> = []
  for (const [index, input] of inputs.entries()) {
    const category = requireTrimmedProductString(input.category, `products[${index}].category`, PRODUCT_LIMITS.category)
    const name = requireTrimmedProductString(input.name, `products[${index}].name`, PRODUCT_LIMITS.name)
    if (input.description !== undefined && typeof input.description !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description must be a string` })
    const description = input.description?.trim() ?? ''
    if (description.length > PRODUCT_LIMITS.description) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description is too long` })
    const orderUrl = validateProductOrderUrl(input.order_url)
    const tags = validateProductTags(input.tags)
    const details = validateProductDetails(input.details)
    const price = normalizePriceInput(input.price, defaultCurrency, `products[${index}].price`)
    const current = input.product_id ? existingById.get(input.product_id)! : null
    const id = current?.id ?? crypto.randomUUID()
    orderedIds.push(id)
    const isVisible = validateOptionalBoolean(input.is_visible, `products[${index}].is_visible`, current?.is_visible ?? true)
    const isAvailable = validateOptionalBoolean(input.available, `products[${index}].available`, current?.available ?? true)
    const isFeatured = validateOptionalBoolean(input.featured, `products[${index}].featured`, current?.featured ?? false)
    const channelAvailability = validateChannelAvailability(input.channel_availability, `products[${index}].channel_availability`, {
      seo: current?.channel_availability.find(row => row.channel === 'seo')?.is_available ?? isVisible,
      ordering: current?.channel_availability.find(row => row.channel === 'ordering')?.is_available ?? isAvailable,
    })
    const featuredSortOrder = input.featured_sort_order === undefined ? current?.featured_sort_order ?? 0 : validateNonNegativeInteger(input.featured_sort_order, `products[${index}].featured_sort_order`)
    placementRows.push({ id: current?.menu_placement?.id ?? crypto.randomUUID(), product_id: id, section: category, sort_order: index, is_published: isVisible, featured: isFeatured, featured_sort_order: featuredSortOrder })
    channelRows.push(
      { id: crypto.randomUUID(), product_id: id, channel: 'seo', is_available: channelAvailability.seo },
      { id: crypto.randomUUID(), product_id: id, channel: 'ordering', is_available: channelAvailability.ordering },
    )
    if (current) {
      writes.push({
        query: `UPDATE products SET category=?, name=?, description=?, order_url=?, is_visible=?, available=?, featured=?, featured_sort_order=?, tags_json=?, details_json=?, seo_title=?, seo_description=?, canonical_url=?, robots=?, source='manual', updated_at=?, updated_by=? WHERE id=? AND organization_id=? AND site_id=? AND location_id=? AND product_type='standard'`,
        params: [category, name, input.description === undefined ? current.description : description,
          input.order_url === undefined ? current.order_url : orderUrl,
          isVisible,
          isAvailable,
          isFeatured,
          featuredSortOrder,
          JSON.stringify(input.tags === undefined ? current.tags : tags),
          JSON.stringify(input.details === undefined ? current.details : details),
          input.seo_title === undefined ? current.seo_title : normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
          input.seo_description === undefined ? current.seo_description : normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
          input.canonical_url === undefined ? current.canonical_url : validateProductCanonicalUrl(input.canonical_url),
          input.robots === undefined ? current.robots : validateProductRobots(input.robots), now, actor,
          id, organizationId, siteId, locationId],
      })
      const samePrice = current.price
        && input.price.valid_from === undefined && input.price.valid_until === undefined
        && current.price.amount_minor === price.amountMinor
        && current.price.currency === price.currency
        && current.price.unit === price.unit
        && current.price.tax_behavior === price.taxBehavior
        && current.price.compare_at_amount_minor === price.compareAt
      if (!samePrice) {
        if (current.price && price.validFrom <= current.price.valid_from) throw new HTTPError({ statusCode: 409, statusMessage: `products[${index}].price must start after the active Price` })
        const conflict = await queryFirst<{ id: string }>(db, `SELECT id FROM prices WHERE product_id = ? AND id <> COALESCE(?, '') AND valid_from < COALESCE(?, '9999-12-31T23:59:59.999Z') AND (valid_until IS NULL OR valid_until > ?) LIMIT 1`, [id, current.price?.id ?? null, price.validUntil, price.validFrom])
        if (conflict) throw new HTTPError({ statusCode: 409, statusMessage: `products[${index}].price overlaps an existing Price` })
        if (current.price) writes.push({ query: `UPDATE prices SET valid_until=? WHERE id=? AND valid_until IS NULL`, params: [price.validFrom, current.price.id] })
        writes.push({
          query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
        })
      }
      continue
    }
    const base = slugifyProductName(name)
    if (!base) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].name must produce a non-empty ASCII slug` })
    let slug = ''
    for (let suffix = 1; suffix <= MAX_SLUG_SUFFIX_ATTEMPTS; suffix += 1) {
      const suffixText = suffix === 1 ? '' : `-${suffix}`
      const candidate = `${base.slice(0, 120 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
      if (!usedSlugs.has(candidate)) { slug = candidate; usedSlugs.add(candidate); break }
    }
    if (!slug) throw new HTTPError({ statusCode: 409, statusMessage: `Unable to create a unique Product slug for products[${index}]` })
    writes.push({
      query: `INSERT INTO products (id, organization_id, site_id, location_id, product_type, category, name, slug, description, order_url, is_visible, available, featured, featured_sort_order, sort_order, tags_json, details_json, seo_title, seo_description, canonical_url, robots, source, created_at, updated_at, created_by, updated_by) VALUES (?,?,?,?,'standard',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [id, organizationId, siteId, locationId, category, name, slug, description, orderUrl,
        isVisible,
        isAvailable,
        isFeatured,
        featuredSortOrder,
        index, JSON.stringify(tags), JSON.stringify(details),
        normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
        normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
        validateProductCanonicalUrl(input.canonical_url), validateProductRobots(input.robots), validateSource(input.source), now, now, actor, actor],
    }, {
      query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
    })
  }
  const omitted = existing.filter(product => !requestedIds.includes(product.id))
  const intendedIds = [...orderedIds]
  for (const product of omitted) {
    orderedIds.push(product.id)
  }
  if (setMissingUnavailable && omitted.length > 0) {
    writes.push({
      query: `UPDATE products SET available = 0, updated_at = ?, updated_by = ? WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard' AND id NOT IN (SELECT value FROM json_each(?))`,
      params: [now, actor, organizationId, siteId, locationId, d1JsonArray(intendedIds)],
    })
  }
  writes.push({
    query: `INSERT INTO product_menu_placements (id, organization_id, site_id, location_id, product_id, section, sort_order, is_published, featured, featured_sort_order, created_at, updated_at, created_by, updated_by)
            SELECT json_extract(value, '$.id'), ?, ?, ?, json_extract(value, '$.product_id'), json_extract(value, '$.section'), json_extract(value, '$.sort_order'), json_extract(value, '$.is_published'), json_extract(value, '$.featured'), json_extract(value, '$.featured_sort_order'), ?, ?, ?, ? FROM json_each(?) WHERE true
            ON CONFLICT (organization_id, site_id, location_id, product_id) DO UPDATE SET section = excluded.section, sort_order = excluded.sort_order, is_published = excluded.is_published, featured = excluded.featured, featured_sort_order = excluded.featured_sort_order, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    params: [organizationId, siteId, locationId, now, now, actor, actor, JSON.stringify(placementRows)],
  }, {
    query: `INSERT INTO product_channel_availability (id, organization_id, site_id, location_id, product_id, channel, is_available, created_at, updated_at, updated_by)
            SELECT json_extract(value, '$.id'), ?, ?, ?, json_extract(value, '$.product_id'), json_extract(value, '$.channel'), json_extract(value, '$.is_available'), ?, ?, ? FROM json_each(?) WHERE true
            ON CONFLICT (organization_id, site_id, location_id, product_id, channel) DO UPDATE SET is_available = excluded.is_available, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    params: [organizationId, siteId, locationId, now, now, actor, JSON.stringify(channelRows)],
  })
  writes.push(denseProductOrderQuery({ organizationId, siteId, locationId, ids: orderedIds, actor, now }))
  writes.push(publicResourceCacheInvalidationQuery(siteId, 'product.synced'))
  await executeBatch(db, writes, { operation: 'sync Products' })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { product_count: inputs.length, omitted_count: omitted.length, set_missing_unavailable: setMissingUnavailable } })
  return listLocationProducts(db, organizationId, siteId, locationId)
}

export async function updateProduct(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  productId: string,
  input: UpdateProductInput,
  actor: string,
  env: CloudflareEnv,
): Promise<Product> {
  const existing = await getProduct(db, organizationId, siteId, locationId, productId)
  if (!existing) notFound()
  if (input.sort_order !== undefined && input.sort_order !== existing.sort_order) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Use move_products to change Product order' })
  }
  const sets: string[] = []
  const params: SqlValue[] = []
  const add = (column: string, value: SqlValue) => { sets.push(`${column} = ?`); params.push(value) }
  if (input.category !== undefined) add('category', requireTrimmedProductString(input.category, 'category', PRODUCT_LIMITS.category))
  if (input.name !== undefined) add('name', requireTrimmedProductString(input.name, 'name', PRODUCT_LIMITS.name))
  if (input.description !== undefined) {
    if (typeof input.description !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: 'description must be a string' })
    const description = input.description.trim()
    if (description.length > PRODUCT_LIMITS.description) throw new HTTPError({ statusCode: 400, statusMessage: `description must be at most ${PRODUCT_LIMITS.description} characters` })
    add('description', description)
  }
  if (input.order_url !== undefined) add('order_url', validateProductOrderUrl(input.order_url))
  if (input.is_visible !== undefined) add('is_visible', validateOptionalBoolean(input.is_visible, 'is_visible', existing.is_visible))
  if (input.available !== undefined) add('available', validateOptionalBoolean(input.available, 'available', existing.available))
  if (input.featured !== undefined) add('featured', validateOptionalBoolean(input.featured, 'featured', existing.featured))
  if (input.featured_sort_order !== undefined) add('featured_sort_order', validateNonNegativeInteger(input.featured_sort_order, 'featured_sort_order'))
  if (input.tags !== undefined) add('tags_json', JSON.stringify(validateProductTags(input.tags)))
  if (input.details !== undefined) add('details_json', JSON.stringify(validateProductDetails(input.details)))
  if (input.seo_title !== undefined) add('seo_title', normalizeOptionalProductString(input.seo_title, 'seo_title', PRODUCT_LIMITS.seoTitle))
  if (input.seo_description !== undefined) add('seo_description', normalizeOptionalProductString(input.seo_description, 'seo_description', PRODUCT_LIMITS.seoDescription))
  if (input.canonical_url !== undefined) add('canonical_url', validateProductCanonicalUrl(input.canonical_url))
  if (input.robots !== undefined) add('robots', validateProductRobots(input.robots))
  if (!sets.length && input.price === undefined && input.channel_availability === undefined && input.modifier_groups === undefined) return existing
  const contentChanged = input.price !== undefined || ['category', 'name', 'description', 'order_url', 'tags_json', 'details_json'].some(column => sets.some(set => set.startsWith(`${column} =`)))
  if (contentChanged) add('source', 'manual')
  const now = new Date().toISOString()
  add('updated_at', now)
  add('updated_by', actor)
  const writes: BatchQuery[] = []
  if (sets.length) {
    params.push(productId, organizationId, siteId, locationId)
    writes.push({ query: `UPDATE products SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`, params })
  }
  if (input.price !== undefined) {
    const at = input.price?.valid_from ?? now
    if (existing.price && at <= existing.price.valid_from) throw new HTTPError({ statusCode: 409, statusMessage: 'Replacement Price must start after the active Price' })
    if (input.price !== null) {
      const price = normalizePriceInput({ ...input.price, valid_from: at }, await siteDefaultCurrency(db, organizationId, siteId))
      const conflict = await queryFirst<{ id: string }>(db, `
        SELECT id FROM prices
        WHERE product_id = ? AND id <> COALESCE(?, '')
          AND valid_from < COALESCE(?, '9999-12-31T23:59:59.999Z')
          AND (valid_until IS NULL OR valid_until > ?)
        LIMIT 1
      `, [productId, existing.price?.id ?? null, price.validUntil, price.validFrom])
      if (conflict) throw new HTTPError({ statusCode: 409, statusMessage: 'Scheduled Price overlaps an existing Price' })
      if (existing.price) writes.push({ query: `UPDATE prices SET valid_until = ? WHERE id = ? AND valid_until IS NULL`, params: [at, existing.price.id] })
      writes.push({
        query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [crypto.randomUUID(), organizationId, siteId, locationId, productId, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
      })
    } else if (existing.price) {
      writes.push({ query: `UPDATE prices SET valid_until = ? WHERE id = ? AND valid_until IS NULL`, params: [at, existing.price.id] })
    }
  }
  const placementChanged = input.category !== undefined || input.is_visible !== undefined || input.featured !== undefined || input.featured_sort_order !== undefined
  if (placementChanged || !existing.menu_placement) {
    writes.push({
      query: `INSERT INTO product_menu_placements (id, organization_id, site_id, location_id, product_id, section, sort_order, is_published, featured, featured_sort_order, created_at, updated_at, created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (organization_id, site_id, location_id, product_id) DO UPDATE SET section = excluded.section, is_published = excluded.is_published, featured = excluded.featured, featured_sort_order = excluded.featured_sort_order, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      params: [existing.menu_placement?.id ?? crypto.randomUUID(), organizationId, siteId, locationId, productId, input.category ?? existing.menu_placement?.section ?? existing.category, existing.menu_placement?.sort_order ?? existing.sort_order, input.is_visible ?? existing.menu_placement?.is_published ?? existing.is_visible, input.featured ?? existing.menu_placement?.featured ?? existing.featured, input.featured_sort_order ?? existing.menu_placement?.featured_sort_order ?? existing.featured_sort_order, now, now, actor, actor],
    })
  }
  if (input.channel_availability !== undefined || input.is_visible !== undefined || input.available !== undefined || existing.channel_availability.length === 0) {
    const currentSeo = existing.channel_availability.find(row => row.channel === 'seo')?.is_available ?? existing.is_visible
    const currentOrdering = existing.channel_availability.find(row => row.channel === 'ordering')?.is_available ?? existing.available
    const channelAvailability = validateChannelAvailability(input.channel_availability, 'channel_availability', {
      seo: input.is_visible ?? currentSeo,
      ordering: input.available ?? currentOrdering,
    })
    for (const [channel, available] of [
      ['seo', channelAvailability.seo],
      ['ordering', channelAvailability.ordering],
    ] as const) {
      writes.push({
        query: `INSERT INTO product_channel_availability (id, organization_id, site_id, location_id, product_id, channel, is_available, created_at, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (organization_id, site_id, location_id, product_id, channel) DO UPDATE SET is_available = excluded.is_available, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        params: [crypto.randomUUID(), organizationId, siteId, locationId, productId, channel, available, now, now, actor],
      })
    }
  }
  if (input.modifier_groups !== undefined) {
    writes.push(...replaceProductModifierQueries({ organizationId, siteId, locationId, productId, modifierGroups: input.modifier_groups, actor, now }))
  }
  const [result] = await executeBatch(db, [
    ...writes,
    publicResourceCacheInvalidationQuery(siteId, 'product.updated'),
  ], { operation: 'update Product' })
  if (sets.length && Number(result?.meta?.changes ?? 0) !== 1) notFound()
  await productEvent(db, 'product.updated', { organizationId, siteId, locationId, actor, productId })
  const updated = await getProduct(db, organizationId, siteId, locationId, productId)
  if (!updated) throw new Error('Product not found after update')
  await refreshSocialCard({ db, env, owner: { owner_type: 'product', owner_id: productId }, actorId: actor })
  return updated
}

type OrderedProduct = { id: string; category: string }

interface ProductLocationScope {
  db: DbClient
  organizationId: string
  siteId: string
  locationId: string
}

interface ProductOrderScope extends ProductLocationScope {
  actor: string
}

async function orderedProducts({ db, organizationId, siteId, locationId }: ProductLocationScope): Promise<OrderedProduct[]> {
  return await queryAll<OrderedProduct>(db, `
    SELECT id, category FROM products
     WHERE organization_id = ? AND site_id = ? AND location_id = ?
       AND product_type = 'standard'
     ORDER BY sort_order, id
  `, [organizationId, siteId, locationId])
}

function validateProductMove(existingIds: string[], movedIds: string[], beforeId: string | null): void {
  if (movedIds.length === 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'product_ids must contain at least one Product ID' })
  }
  if (new Set(movedIds).size !== movedIds.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'product_ids must not contain duplicate Product IDs' })
  }
  const existingIdSet = new Set(existingIds)
  const unknownIds = movedIds.filter(id => !existingIdSet.has(id))
  if (unknownIds.length > 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: `Product IDs not found at this location: ${unknownIds.join(', ')}` })
  }
  const movedIdSet = new Set(movedIds)
  if (beforeId !== null && movedIdSet.has(beforeId)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'before_product_id must not be one of product_ids' })
  }
  const remainingIds = existingIds.filter(id => !movedIdSet.has(id))
  const insertionIndex = beforeId === null ? remainingIds.length : remainingIds.indexOf(beforeId)
  if (insertionIndex < 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: `before_product_id was not found at this location: ${beforeId}` })
  }
}

function denseProductOrderQuery({ organizationId, siteId, locationId, ids, actor, now }: {
  organizationId: string
  siteId: string
  locationId: string
  ids: string[]
  actor: string
  now: string
}): BatchQuery {
  return {
    query: `
      WITH desired_order AS (
        SELECT CAST(key AS INTEGER) AS sort_order, value AS id
          FROM json_each(?)
      )
      UPDATE products
         SET sort_order = (SELECT sort_order FROM desired_order WHERE desired_order.id = products.id),
             updated_at = ?,
             updated_by = ?
       WHERE organization_id = ? AND site_id = ? AND location_id = ?
         AND product_type = 'standard'
         AND EXISTS (SELECT 1 FROM desired_order WHERE desired_order.id = products.id)
    `,
    params: [d1JsonArray(ids), now, actor, organizationId, siteId, locationId],
  }
}

function atomicProductMoveQuery({ organizationId, siteId, locationId, movedIds, beforeId, actor, now }: {
  organizationId: string
  siteId: string
  locationId: string
  movedIds: string[]
  beforeId: string | null
  actor: string
  now: string
}): BatchQuery {
  return {
    query: `
      WITH moved_products AS (
        SELECT value AS id, CAST(key AS INTEGER) AS moved_order
          FROM json_each(?)
      ),
      remaining_products AS MATERIALIZED (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1 AS remaining_order
          FROM products
         WHERE organization_id = ? AND site_id = ? AND location_id = ?
           AND product_type = 'standard'
           AND id NOT IN (SELECT id FROM moved_products)
      ),
      insertion AS (
        SELECT CASE
          WHEN ? IS NULL THEN (SELECT COUNT(*) FROM remaining_products)
          ELSE (SELECT remaining_order FROM remaining_products WHERE id = ?)
        END AS position
      ),
      desired_order AS (
        SELECT remaining_products.id,
               CASE
                 WHEN remaining_order < insertion.position THEN remaining_order
                 ELSE remaining_order + (SELECT COUNT(*) FROM moved_products)
               END AS sort_order
          FROM remaining_products CROSS JOIN insertion
        UNION ALL
        SELECT moved_products.id, insertion.position + moved_order
          FROM moved_products CROSS JOIN insertion
      )
      UPDATE products
         SET sort_order = (SELECT sort_order FROM desired_order WHERE desired_order.id = products.id),
             updated_at = ?,
             updated_by = ?
       WHERE organization_id = ? AND site_id = ? AND location_id = ?
         AND product_type = 'standard'
         AND EXISTS (SELECT 1 FROM desired_order WHERE desired_order.id = products.id)
    `,
    params: [
      d1JsonArray(movedIds), organizationId, siteId, locationId, beforeId, beforeId,
      now, actor, organizationId, siteId, locationId,
    ],
  }
}

function atomicProductCategoryMoveQuery({ organizationId, siteId, locationId, category, beforeCategory, actor, now }: {
  organizationId: string
  siteId: string
  locationId: string
  category: string
  beforeCategory: string | null
  actor: string
  now: string
}): BatchQuery {
  return {
    query: `
      WITH current_products AS MATERIALIZED (
        SELECT id, category, sort_order
          FROM products
         WHERE organization_id = ? AND site_id = ? AND location_id = ?
           AND product_type = 'standard'
      ),
      moved_products AS MATERIALIZED (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1 AS moved_order
          FROM current_products
         WHERE category = ?
      ),
      remaining_products AS MATERIALIZED (
        SELECT id, category, ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1 AS remaining_order
          FROM current_products
         WHERE category <> ?
      ),
      insertion AS (
        SELECT CASE
          WHEN ? IS NULL THEN (SELECT COUNT(*) FROM remaining_products)
          ELSE (SELECT MIN(remaining_order) FROM remaining_products WHERE category = ?)
        END AS position
      ),
      desired_order AS (
        SELECT remaining_products.id,
               CASE
                 WHEN remaining_order < insertion.position THEN remaining_order
                 ELSE remaining_order + (SELECT COUNT(*) FROM moved_products)
               END AS sort_order
          FROM remaining_products CROSS JOIN insertion
        UNION ALL
        SELECT moved_products.id, insertion.position + moved_order
          FROM moved_products CROSS JOIN insertion
      )
      UPDATE products
         SET sort_order = (SELECT sort_order FROM desired_order WHERE desired_order.id = products.id),
             updated_at = ?,
             updated_by = ?
       WHERE organization_id = ? AND site_id = ? AND location_id = ?
         AND product_type = 'standard'
         AND EXISTS (SELECT 1 FROM desired_order WHERE desired_order.id = products.id)
    `,
    params: [
      organizationId, siteId, locationId, category, category, beforeCategory, beforeCategory,
      now, actor, organizationId, siteId, locationId,
    ],
  }
}

async function persistProductMove(input: ProductOrderScope & { move: BatchQuery; now: string }): Promise<void> {
  await executeBatch(input.db, [
    input.move,
    {
      query: `UPDATE product_menu_placements
                 SET sort_order = (SELECT sort_order FROM products WHERE products.id = product_menu_placements.product_id),
                     updated_at = ?, updated_by = ?
               WHERE organization_id = ? AND site_id = ? AND location_id = ?`,
      params: [input.now, input.actor, input.organizationId, input.siteId, input.locationId],
    },
    publicResourceCacheInvalidationQuery(input.siteId, 'product.reordered'),
  ], { operation: 'reorder Products' })
}

export async function moveProducts({ db, organizationId, siteId, locationId, productIds, beforeProductId, actor }: ProductOrderScope & {
  productIds: string[]
  beforeProductId: string | null
}): Promise<void> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const existingIds = (await orderedProducts({ db, organizationId, siteId, locationId })).map(product => product.id)
  validateProductMove(existingIds, productIds, beforeProductId)
  const now = new Date().toISOString()
  await persistProductMove({ db, organizationId, siteId, locationId, actor, now, move: atomicProductMoveQuery({
    organizationId,
    siteId,
    locationId,
    movedIds: productIds,
    beforeId: beforeProductId,
    actor,
    now,
  }) })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { product_ids: productIds, before_product_id: beforeProductId } })
}

export async function moveProductCategory({ db, organizationId, siteId, locationId, category, beforeCategory, actor }: ProductOrderScope & {
  category: string
  beforeCategory: string | null
}): Promise<void> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const normalizedCategory = requireTrimmedProductString(category, 'category', PRODUCT_LIMITS.category)
  const normalizedBeforeCategory = beforeCategory === null
    ? null
    : requireTrimmedProductString(beforeCategory, 'before_category', PRODUCT_LIMITS.category)
  if (normalizedBeforeCategory === normalizedCategory) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'before_category must be a different category' })
  }
  const products = await orderedProducts({ db, organizationId, siteId, locationId })
  const categoryProducts = products.filter(product => product.category === normalizedCategory)
  if (categoryProducts.length === 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: `Product category not found at this location: ${normalizedCategory}` })
  }
  if (normalizedBeforeCategory !== null && !products.some(product => product.category === normalizedBeforeCategory)) {
    throw new HTTPError({ statusCode: 404, statusMessage: `before_category was not found at this location: ${normalizedBeforeCategory}` })
  }
  const movedIds = categoryProducts.map(product => product.id)
  const remainingProducts = products.filter(product => product.category !== normalizedCategory)
  const beforeProductId = normalizedBeforeCategory === null
    ? null
    : remainingProducts.find(product => product.category === normalizedBeforeCategory)?.id ?? null
  validateProductMove(products.map(product => product.id), movedIds, beforeProductId)
  const now = new Date().toISOString()
  await persistProductMove({ db, organizationId, siteId, locationId, actor, now, move: atomicProductCategoryMoveQuery({
    organizationId,
    siteId,
    locationId,
    category: normalizedCategory,
    beforeCategory: normalizedBeforeCategory,
    actor,
    now,
  }) })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { category: normalizedCategory, before_category: normalizedBeforeCategory, product_count: movedIds.length } })
}

export async function deleteProduct(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  productId: string,
  actor: string,
): Promise<boolean> {
  const existing = await getProduct(db, organizationId, siteId, locationId, productId)
  if (!existing) return false
  const remainingIds = (await orderedProducts({ db, organizationId, siteId, locationId })).map(product => product.id).filter(id => id !== productId)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: `DELETE FROM reviews WHERE product_id = ?`, params: [productId] },
    { query: `DELETE FROM media_placements WHERE owner_type = 'product' AND owner_id = ? AND organization_id = ? AND site_id = ?`, params: [productId, organizationId, siteId] },
    { query: `DELETE FROM products WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`, params: [productId, organizationId, siteId, locationId] },
    denseProductOrderQuery({ organizationId, siteId, locationId, ids: remainingIds, actor, now }),
    { query: `UPDATE product_menu_placements SET sort_order = (SELECT sort_order FROM products WHERE products.id = product_menu_placements.product_id), updated_at = ?, updated_by = ? WHERE organization_id = ? AND site_id = ? AND location_id = ?`, params: [now, actor, organizationId, siteId, locationId] },
    publicResourceCacheInvalidationQuery(siteId, 'product.deleted'),
  ], { operation: 'delete Product' })
  await productEvent(db, 'product.deleted', { organizationId, siteId, locationId, actor, productId, metadata: { category: existing.category } })
  return true
}

export async function renameProductCategory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  oldCategoryInput: string,
  newCategoryInput: string,
  actor: string,
): Promise<number> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const oldCategory = requireTrimmedProductString(oldCategoryInput, 'old_category', PRODUCT_LIMITS.category)
  const newCategory = requireTrimmedProductString(newCategoryInput, 'new_category', PRODUCT_LIMITS.category)
  const conflict = await queryFirst(db, `SELECT id FROM products WHERE organization_id = ? AND site_id = ? AND location_id = ? AND category = ? LIMIT 1`, [organizationId, siteId, locationId, newCategory])
  if (conflict) throw new HTTPError({ statusCode: 409, statusMessage: 'Target category already exists' })
  const now = new Date().toISOString()
  const [result] = await executeBatch(db, [
    { query: `UPDATE products SET category = ?, updated_at = ?, updated_by = ?, source = 'manual' WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard' AND category = ?`, params: [newCategory, now, actor, organizationId, siteId, locationId, oldCategory] },
    { query: `UPDATE product_menu_placements SET section = ?, updated_at = ?, updated_by = ? WHERE organization_id = ? AND site_id = ? AND location_id = ? AND section = ?`, params: [newCategory, now, actor, organizationId, siteId, locationId, oldCategory] },
    publicResourceCacheInvalidationQuery(siteId, 'product.category_renamed'),
  ], { operation: 'rename Product category' })
  const changes = Number(result?.meta?.changes ?? 0)
  if (!changes) throw new HTTPError({ statusCode: 404, statusMessage: 'Product category not found' })
  await productEvent(db, 'product.category_renamed', { organizationId, siteId, locationId, actor, metadata: { old_category: oldCategory, new_category: newCategory, product_count: changes } })
  return changes
}

export async function deleteProductCategory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  categoryInput: string,
  actor: string,
): Promise<number> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const category = requireTrimmedProductString(categoryInput, 'category', PRODUCT_LIMITS.category)
  const rows = await queryAll<{ id: string }>(db, `SELECT id FROM products WHERE organization_id = ? AND site_id = ? AND location_id = ? AND category = ?`, [organizationId, siteId, locationId, category])
  if (!rows.length) throw new HTTPError({ statusCode: 404, statusMessage: 'Product category not found' })
  const deletedIds = rows.map(row => row.id)
  const deletedIdSet = new Set(deletedIds)
  const remainingIds = (await orderedProducts({ db, organizationId, siteId, locationId })).map(product => product.id).filter(id => !deletedIdSet.has(id))
  const idJson = d1JsonArray(deletedIds)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: `DELETE FROM reviews WHERE product_id IN (SELECT value FROM json_each(?))`, params: [idJson] },
    { query: `DELETE FROM media_placements WHERE owner_type = 'product' AND owner_id IN (SELECT value FROM json_each(?)) AND organization_id = ? AND site_id = ?`, params: [idJson, organizationId, siteId] },
    { query: `DELETE FROM products WHERE id IN (SELECT value FROM json_each(?)) AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`, params: [idJson, organizationId, siteId, locationId] },
    denseProductOrderQuery({ organizationId, siteId, locationId, ids: remainingIds, actor, now }),
    { query: `UPDATE product_menu_placements SET sort_order = (SELECT p.sort_order FROM products p WHERE p.id = product_menu_placements.product_id), updated_at = ?, updated_by = ? WHERE organization_id = ? AND site_id = ? AND location_id = ?`, params: [now, actor, organizationId, siteId, locationId] },
    publicResourceCacheInvalidationQuery(siteId, 'product.category_deleted'),
  ], { operation: 'delete Product category' })
  await productEvent(db, 'product.category_deleted', { organizationId, siteId, locationId, actor, metadata: { category, product_count: deletedIds.length } })
  return deletedIds.length
}
