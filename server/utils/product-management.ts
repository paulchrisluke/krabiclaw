import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import type {
  CreateProductInput,
  Product,
  ProductDetail,
  ProductSource,
  SyncProductInput,
  UpdateProductInput,
} from '~/server/types/products'
import { getMediaPlacements } from '~/server/utils/media-placement'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { fireSiteEventSafe, type SiteEventType } from '~/server/utils/site-events'
import { syncSocialImageForOwner } from '~/server/utils/social-image/sync'
import { SocialImageResolutionError } from '~/server/utils/social-image-resolver'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  PRODUCT_LIMITS,
  normalizeOptionalProductString,
  requireTrimmedProductString,
  validateProductCanonicalUrl,
  validateProductDetails,
  validateProductOrderUrl,
  validateProductRobots,
  validateProductSale,
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
  return {
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
    sale_starts_at: row.sale_starts_at === null ? null : String(row.sale_starts_at),
    sale_ends_at: row.sale_ends_at === null ? null : String(row.sale_ends_at),
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
    seo_title: row.seo_title === null ? null : String(row.seo_title),
    seo_description: row.seo_description === null ? null : String(row.seo_description),
    canonical_url: row.canonical_url === null ? null : String(row.canonical_url),
    robots: row.robots === null ? null : String(row.robots),
    source: String(row.source) as ProductSource,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: String(row.created_by),
    updated_by: String(row.updated_by),
  }
}

const PRODUCT_COLUMNS = `
  id, organization_id, site_id, location_id, category, name, slug, description,
  price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url,
  is_visible, available, featured, featured_sort_order, sort_order, tags_json,
  details_json, seo_title, seo_description, canonical_url, robots, source,
  created_at, updated_at, created_by, updated_by
`

async function hydrateProductMedia(db: DbClient, siteId: string, products: Product[]): Promise<Product[]> {
  if (!products.length) return products
  const ownerIds = products.map(product => product.id)
  const placements = await getMediaPlacements(db, { siteId, ownerType: 'product', ownerIds })
  return products.map((product) => {
    const media = placements.get(product.id) ?? []
    return {
      ...product,
      image: media.find(item => item.slot === 'image') ?? null,
      gallery: media.filter(item => item.slot === 'gallery'),
    }
  })
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
      FROM products
     WHERE organization_id = ? AND site_id = ? AND location_id = ?
       ${options.publicOnly ? 'AND is_visible = 1' : ''}
     ORDER BY sort_order, id
  `, [organizationId, siteId, locationId])
  return hydrateProductMedia(db, siteId, rows.map(mapProduct))
}

export async function listPublicSiteProducts(
  db: DbClient,
  siteId: string,
  locationIds?: string[],
): Promise<Product[]> {
  const scoped = locationIds !== undefined
  if (scoped && locationIds.length === 0) return []
  const rows = await queryAll<ProductRow>(db, `
    SELECT ${PRODUCT_COLUMNS}
      FROM products
     WHERE site_id = ? AND is_visible = 1
       ${scoped ? 'AND location_id IN (SELECT value FROM json_each(?))' : ''}
     ORDER BY location_id, sort_order, id
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
      FROM products
     WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?
     LIMIT 1
  `, [productId, organizationId, siteId, locationId])
  if (!row) return null
  const [product] = await hydrateProductMedia(db, siteId, [mapProduct(row)])
  return product ?? null
}

export async function getPublicProductBySlug(
  db: DbClient,
  siteId: string,
  locationId: string,
  productSlug: string,
): Promise<Product | null> {
  const row = await queryFirst<ProductRow>(db, `
    SELECT ${PRODUCT_COLUMNS}
      FROM products
     WHERE site_id = ? AND location_id = ? AND slug = ? AND is_visible = 1
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

function productEvent(
  db: DbClient,
  eventType: SiteEventType,
  input: { organizationId: string; siteId: string; locationId: string; actor: string; productId?: string; metadata?: Record<string, unknown> },
) {
  return fireSiteEventSafe({
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
  env?: CloudflareEnv,
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
  const sale = validateProductSale(input)
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
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const insert: BatchQuery = {
    query: `INSERT INTO products (
      id, organization_id, site_id, location_id, category, name, slug, description,
      price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url,
      is_visible, available, featured, featured_sort_order, sort_order, tags_json,
      details_json, seo_title, seo_description, canonical_url, robots, source,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id, organizationId, siteId, locationId, category, name, slug, description,
      sale.priceAmount, sale.compareAtPriceAmount, sale.saleStartsAt, sale.saleEndsAt, orderUrl,
      validateOptionalBoolean(input.is_visible, 'is_visible', true),
      validateOptionalBoolean(input.available, 'available', true),
      validateOptionalBoolean(input.featured, 'featured', false),
      featuredSortOrder, requestedOrder, JSON.stringify(tags), JSON.stringify(details),
      seoTitle, seoDescription, canonicalUrl, robots, source, now, now, actor, actor,
    ],
  }
  const queries: BatchQuery[] = requestedOrder === productCount
    ? [insert]
    : [
        { query: `UPDATE products SET sort_order = sort_order + ? WHERE site_id = ? AND location_id = ?`, params: [REORDER_OFFSET, siteId, locationId] },
        insert,
        { query: `UPDATE products SET sort_order = (sort_order - ?) + CASE WHEN sort_order - ? >= ? THEN 1 ELSE 0 END WHERE site_id = ? AND location_id = ? AND id <> ?`, params: [REORDER_OFFSET, REORDER_OFFSET, requestedOrder, siteId, locationId, id] },
      ]
  queries.push(publicResourceCacheInvalidationQuery(siteId, 'product.created'))
  await executeBatch(db, queries, { operation: 'create Product' })
  await productEvent(db, 'product.created', { organizationId, siteId, locationId, actor, productId: id, metadata: { category, name } })
  const created = await getProduct(db, organizationId, siteId, locationId, id)
  if (!created) throw new Error('Product not found after create')
  if (env) {
    await syncSocialImageForOwner(db, env, { siteId, ownerType: 'product', ownerId: id, title: name, description }).catch((error) => {
      if (!(error instanceof SocialImageResolutionError)) throw error
    })
  }
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
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 100) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'products must contain between 1 and 100 rows' })
  }
  const existing = await queryAll<{ slug: string }>(db, `SELECT slug FROM products WHERE site_id = ? AND location_id = ?`, [siteId, locationId])
  const usedSlugs = new Set(existing.map(row => row.slug))
  const now = new Date().toISOString()
  const ids: string[] = []
  const inserts: BatchQuery[] = inputs.map((input, index) => {
    const category = requireTrimmedProductString(input.category, `products[${index}].category`, PRODUCT_LIMITS.category)
    const name = requireTrimmedProductString(input.name, `products[${index}].name`, PRODUCT_LIMITS.name)
    if (input.description !== undefined && typeof input.description !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description must be a string` })
    const description = input.description?.trim() ?? ''
    if (description.length > PRODUCT_LIMITS.description) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description is too long` })
    const sale = validateProductSale(input)
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
    return {
      query: `INSERT INTO products (
        id, organization_id, site_id, location_id, category, name, slug, description,
        price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url,
        is_visible, available, featured, featured_sort_order, sort_order, tags_json,
        details_json, seo_title, seo_description, canonical_url, robots, source,
        created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id, organizationId, siteId, locationId, category, name, slug, description,
        sale.priceAmount, sale.compareAtPriceAmount, sale.saleStartsAt, sale.saleEndsAt, validateProductOrderUrl(input.order_url),
        validateOptionalBoolean(input.is_visible, `products[${index}].is_visible`, true),
        validateOptionalBoolean(input.available, `products[${index}].available`, true),
        validateOptionalBoolean(input.featured, `products[${index}].featured`, false),
        input.featured_sort_order === undefined ? 0 : validateNonNegativeInteger(input.featured_sort_order, `products[${index}].featured_sort_order`),
        existing.length + index, JSON.stringify(validateProductTags(input.tags)), JSON.stringify(validateProductDetails(input.details)),
        normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
        normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
        validateProductCanonicalUrl(input.canonical_url), validateProductRobots(input.robots), validateSource(input.source),
        now, now, actor, actor,
      ],
    }
  })
  await executeBatch(db, [...inserts, publicResourceCacheInvalidationQuery(siteId, 'product.batch_created')], { operation: 'batch create Products' })
  await productEvent(db, 'product.created', { organizationId, siteId, locationId, actor, metadata: { product_ids: ids } })
  const created = await queryAll<ProductRow>(db, `SELECT ${PRODUCT_COLUMNS} FROM products WHERE site_id = ? AND location_id = ? AND id IN (SELECT value FROM json_each(?)) ORDER BY sort_order, id`, [siteId, locationId, JSON.stringify(ids)])
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
  if (!Array.isArray(inputs) || inputs.length > 100) throw new HTTPError({ statusCode: 400, statusMessage: 'products may contain at most 100 rows' })
  const existing = await listLocationProducts(db, organizationId, siteId, locationId)
  const existingById = new Map(existing.map(product => [product.id, product]))
  const requestedIds = inputs.map(input => input.product_id).filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (new Set(requestedIds).size !== requestedIds.length) throw new HTTPError({ statusCode: 400, statusMessage: 'product_id values must be unique' })
  if (requestedIds.some(id => !existingById.has(id))) notFound()
  const usedSlugs = new Set(existing.map(product => product.slug))
  const now = new Date().toISOString()
  const orderedIds: string[] = []
  const writes: BatchQuery[] = [{ query: `UPDATE products SET sort_order = sort_order + ? WHERE organization_id = ? AND site_id = ? AND location_id = ?`, params: [REORDER_OFFSET, organizationId, siteId, locationId] }]
  inputs.forEach((input, index) => {
    const category = requireTrimmedProductString(input.category, `products[${index}].category`, PRODUCT_LIMITS.category)
    const name = requireTrimmedProductString(input.name, `products[${index}].name`, PRODUCT_LIMITS.name)
    if (input.description !== undefined && typeof input.description !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description must be a string` })
    const description = input.description?.trim() ?? ''
    if (description.length > PRODUCT_LIMITS.description) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description is too long` })
    const sale = validateProductSale(input)
    const values = [
      category, name, description, sale.priceAmount, sale.compareAtPriceAmount, sale.saleStartsAt, sale.saleEndsAt,
      validateProductOrderUrl(input.order_url), validateOptionalBoolean(input.is_visible, `products[${index}].is_visible`, true),
      validateOptionalBoolean(input.available, `products[${index}].available`, true), validateOptionalBoolean(input.featured, `products[${index}].featured`, false),
      input.featured_sort_order === undefined ? 0 : validateNonNegativeInteger(input.featured_sort_order, `products[${index}].featured_sort_order`),
      index, JSON.stringify(validateProductTags(input.tags)), JSON.stringify(validateProductDetails(input.details)),
      normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
      normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
      validateProductCanonicalUrl(input.canonical_url), validateProductRobots(input.robots), now, actor,
    ]
    if (input.product_id) {
      orderedIds.push(input.product_id)
      writes.push({ query: `UPDATE products SET category = ?, name = ?, description = ?, price_amount = ?, compare_at_price_amount = ?, sale_starts_at = ?, sale_ends_at = ?, order_url = ?, is_visible = ?, available = ?, featured = ?, featured_sort_order = ?, sort_order = ?, tags_json = ?, details_json = ?, seo_title = ?, seo_description = ?, canonical_url = ?, robots = ?, source = 'manual', updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?`, params: [...values, input.product_id, organizationId, siteId, locationId] })
      return
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
    const id = crypto.randomUUID()
    orderedIds.push(id)
    writes.push({ query: `INSERT INTO products (id, organization_id, site_id, location_id, category, name, slug, description, price_amount, compare_at_price_amount, sale_starts_at, sale_ends_at, order_url, is_visible, available, featured, featured_sort_order, sort_order, tags_json, details_json, seo_title, seo_description, canonical_url, robots, source, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, params: [id, organizationId, siteId, locationId, category, name, slug, ...values.slice(2, 19), validateSource(input.source), now, now, actor, actor] })
  })
  const omitted = existing.filter(product => !requestedIds.includes(product.id))
  omitted.forEach((product, offset) => {
    orderedIds.push(product.id)
    writes.push({ query: `UPDATE products SET sort_order = ?, available = CASE WHEN ? THEN 0 ELSE available END, updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?`, params: [inputs.length + offset, setMissingUnavailable, now, actor, product.id, organizationId, siteId, locationId] })
  })
  writes.push(publicResourceCacheInvalidationQuery(siteId, 'product.synced'))
  await executeBatch(db, writes, { operation: 'sync Products' })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { product_ids: orderedIds } })
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
  env?: CloudflareEnv,
): Promise<Product> {
  const existing = await getProduct(db, organizationId, siteId, locationId, productId)
  if (!existing) notFound()
  if (input.sort_order !== undefined && input.sort_order !== existing.sort_order) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Use reorder_products to change sort_order' })
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
  const saleTouched = input.price_amount !== undefined || input.compare_at_price_amount !== undefined || input.sale_starts_at !== undefined || input.sale_ends_at !== undefined
  if (saleTouched) {
    const sale = validateProductSale({
      price_amount: input.price_amount ?? existing.price_amount,
      compare_at_price_amount: input.compare_at_price_amount === undefined ? existing.compare_at_price_amount : input.compare_at_price_amount,
      sale_starts_at: input.sale_starts_at === undefined ? existing.sale_starts_at : input.sale_starts_at,
      sale_ends_at: input.sale_ends_at === undefined ? existing.sale_ends_at : input.sale_ends_at,
    })
    add('price_amount', sale.priceAmount)
    add('compare_at_price_amount', sale.compareAtPriceAmount)
    add('sale_starts_at', sale.saleStartsAt)
    add('sale_ends_at', sale.saleEndsAt)
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
  if (!sets.length) return existing
  const contentChanged = ['category', 'name', 'description', 'price_amount', 'compare_at_price_amount', 'sale_starts_at', 'sale_ends_at', 'order_url', 'tags_json', 'details_json'].some(column => sets.some(set => set.startsWith(`${column} =`)))
  if (contentChanged) add('source', 'manual')
  add('updated_at', new Date().toISOString())
  add('updated_by', actor)
  params.push(productId, organizationId, siteId, locationId)
  const [result] = await executeBatch(db, [
    { query: `UPDATE products SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?`, params },
    publicResourceCacheInvalidationQuery(siteId, 'product.updated'),
  ], { operation: 'update Product' })
  if (Number(result?.meta?.changes ?? 0) !== 1) notFound()
  await productEvent(db, 'product.updated', { organizationId, siteId, locationId, actor, productId })
  const updated = await getProduct(db, organizationId, siteId, locationId, productId)
  if (!updated) throw new Error('Product not found after update')
  if (env) {
    await syncSocialImageForOwner(db, env, { siteId, ownerType: 'product', ownerId: productId, title: updated.name, description: updated.description }).catch((error) => {
      if (!(error instanceof SocialImageResolutionError)) throw error
    })
  }
  return updated
}

async function orderedProductIds(db: DbClient, organizationId: string, siteId: string, locationId: string): Promise<string[]> {
  const rows = await queryAll<{ id: string }>(db, `
    SELECT id FROM products
     WHERE organization_id = ? AND site_id = ? AND location_id = ?
     ORDER BY sort_order, id
  `, [organizationId, siteId, locationId])
  return rows.map(row => row.id)
}

function denseReorderQueries(siteId: string, locationId: string, ids: string[], actor: string, now: string): BatchQuery[] {
  return [
    { query: `UPDATE products SET sort_order = sort_order + ? WHERE site_id = ? AND location_id = ?`, params: [REORDER_OFFSET, siteId, locationId] },
    ...ids.map((id, sortOrder) => ({
      query: `UPDATE products SET sort_order = ?, updated_at = ?, updated_by = ? WHERE id = ? AND site_id = ? AND location_id = ?`,
      params: [sortOrder, now, actor, id, siteId, locationId],
    })),
  ]
}

export async function reorderProducts(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  requested: Array<{ id: string; sort_order: number }>,
  actor: string,
): Promise<void> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const existing = await orderedProductIds(db, organizationId, siteId, locationId)
  if (requested.length !== existing.length || new Set(requested.map(item => item.id)).size !== requested.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Reorder must contain every Product in the location exactly once' })
  }
  const requestedIds = new Set(requested.map(item => item.id))
  if (existing.some(id => !requestedIds.has(id))) notFound()
  const orders = requested.map(item => validateNonNegativeInteger(item.sort_order, 'sort_order')).sort((a, b) => a - b)
  if (orders.some((order, index) => order !== index)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'sort_order values must be dense from zero' })
  }
  const ids = [...requested].sort((a, b) => a.sort_order - b.sort_order).map(item => item.id)
  const now = new Date().toISOString()
  await executeBatch(db, [
    ...denseReorderQueries(siteId, locationId, ids, actor, now),
    publicResourceCacheInvalidationQuery(siteId, 'product.reordered'),
  ], { operation: 'reorder Products' })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { product_ids: ids } })
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
  const remainingIds = (await orderedProductIds(db, organizationId, siteId, locationId)).filter(id => id !== productId)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: `DELETE FROM reviews WHERE product_id = ?`, params: [productId] },
    { query: `DELETE FROM media_placements WHERE owner_type = 'product' AND owner_id = ? AND organization_id = ? AND site_id = ?`, params: [productId, organizationId, siteId] },
    { query: `DELETE FROM products WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?`, params: [productId, organizationId, siteId, locationId] },
    ...denseReorderQueries(siteId, locationId, remainingIds, actor, now),
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
    { query: `UPDATE products SET category = ?, updated_at = ?, updated_by = ?, source = 'manual' WHERE organization_id = ? AND site_id = ? AND location_id = ? AND category = ?`, params: [newCategory, now, actor, organizationId, siteId, locationId, oldCategory] },
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
  const remainingIds = (await orderedProductIds(db, organizationId, siteId, locationId)).filter(id => !deletedIds.includes(id))
  const idJson = JSON.stringify(deletedIds)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: `DELETE FROM reviews WHERE product_id IN (SELECT value FROM json_each(?))`, params: [idJson] },
    { query: `DELETE FROM media_placements WHERE owner_type = 'product' AND owner_id IN (SELECT value FROM json_each(?)) AND organization_id = ? AND site_id = ?`, params: [idJson, organizationId, siteId] },
    { query: `DELETE FROM products WHERE id IN (SELECT value FROM json_each(?)) AND organization_id = ? AND site_id = ? AND location_id = ?`, params: [idJson, organizationId, siteId, locationId] },
    ...denseReorderQueries(siteId, locationId, remainingIds, actor, now),
    publicResourceCacheInvalidationQuery(siteId, 'product.category_deleted'),
  ], { operation: 'delete Product category' })
  await productEvent(db, 'product.category_deleted', { organizationId, siteId, locationId, actor, metadata: { category, product_count: deletedIds.length } })
  return deletedIds.length
}
