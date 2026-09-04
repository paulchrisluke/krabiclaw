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
import { fireOrganizationEventSafe, type OrganizationEventType } from '~/server/utils/organization-events'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import { isIsoInstant, PRICE_TAX_BEHAVIORS, PRICE_UNITS, type Price, type PriceInput, type PriceTaxBehavior, type PriceUnit } from '~/shared/prices'
import {
  PRODUCT_LIMITS,
  assertNoPriceNoteContradiction,
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

interface ProductWriteAttribution {
  actorId: string
  priceProvenance?: ProductPriceProvenance
}

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
    category_id: String(row.category_id),
    category: {
      id: String(row.category_id),
      name: String(row.category_name),
      slug: String(row.category_slug),
      sort_order: Number(row.category_sort_order),
    },
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
  }
}

const PRODUCT_COLUMNS = `
  p.id, p.organization_id, p.site_id, p.location_id, p.product_type, p.category_id, p.name, p.slug, p.description,
  pc.name AS category_name, pc.slug AS category_slug, pc.sort_order AS category_sort_order,
  p.order_url,
  p.is_visible, p.available, p.featured, p.featured_sort_order, p.sort_order, p.tags_json,
  p.details_json, p.seo_title, p.seo_description, p.canonical_url, p.robots, p.source,
  p.created_at, p.updated_at, p.created_by, p.updated_by,
  pr.id AS price_id, pr.amount_minor, pr.currency, pr.unit, pr.tax_behavior,
  pr.compare_at_amount_minor, pr.valid_from, pr.valid_until, pr.provenance,
  pr.created_by AS price_created_by, pr.created_at AS price_created_at
`

// Category is a required parent, so this is an inner join: a Product with no
// resolvable category is a broken row, not a row to render without a section.
const CATEGORY_JOIN = `
  JOIN product_categories pc ON pc.id = p.category_id
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
  }
}

interface NormalizedPriceInput {
  amountMinor: number
  currency: CurrencyCode
  unit: PriceUnit
  taxBehavior: PriceTaxBehavior
  compareAt: number | null
  validFrom: string
  validUntil: string | null
  provenance: ProductPriceProvenance
  validFromProvided: boolean
  validUntilProvided: boolean
}

export type ProductPriceProvenance = 'manual' | 'ai-import'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPriceUnit(value: unknown): value is PriceUnit {
  return typeof value === 'string' && PRICE_UNITS.some(candidate => candidate === value)
}

function isPriceTaxBehavior(value: unknown): value is PriceTaxBehavior {
  return typeof value === 'string' && PRICE_TAX_BEHAVIORS.some(candidate => candidate === value)
}

export function normalizePriceInput(input: PriceInput | null | undefined, defaultCurrency: CurrencyCode, provenance: ProductPriceProvenance, field = 'price'): NormalizedPriceInput | null {
  if (input === undefined) throw new HTTPError({ statusCode: 400, statusMessage: `${field} is required` })
  if (input === null) return null
  if (!isRecord(input)) throw new HTTPError({ statusCode: 400, statusMessage: `${field} must be an object or null` })
  if (Object.hasOwn(input, 'provenance')) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.provenance is assigned by the server` })
  const amountMinor = input.amount_minor
  if (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.amount_minor must be a non-negative integer` })
  const currency = input.currency === undefined ? defaultCurrency : input.currency
  if (!isCurrencyCode(currency)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.currency must be a supported currency` })
  const unit = input.unit === undefined ? 'item' : input.unit
  if (!isPriceUnit(unit)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.unit must be supported` })
  const taxBehavior = input.tax_behavior === undefined ? 'unspecified' : input.tax_behavior
  if (!isPriceTaxBehavior(taxBehavior)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.tax_behavior must be supported` })
  const compareAt = input.compare_at_amount_minor ?? null
  if (compareAt !== null && (typeof compareAt !== 'number' || !Number.isSafeInteger(compareAt) || compareAt <= amountMinor)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.compare_at_amount_minor must exceed amount_minor` })
  const validFromProvided = input.valid_from !== undefined
  const validFrom = validFromProvided ? input.valid_from : new Date().toISOString()
  if (typeof validFrom !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `${field}.valid_from must be an ISO UTC instant (YYYY-MM-DDTHH:mm:ss[.SSS]Z)` })
  if (!isIsoInstant(validFrom)) throw new HTTPError({ statusCode: 400, statusMessage: `${field}.valid_from must be an ISO UTC instant (YYYY-MM-DDTHH:mm:ss[.SSS]Z)` })
  const validUntilProvided = input.valid_until !== undefined
  const validUntil = input.valid_until ?? null
  if (validUntil !== null && (typeof validUntil !== 'string' || !isIsoInstant(validUntil) || validUntil <= validFrom)) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${field}.valid_until must be an ISO UTC instant after valid_from` })
  }
  return { amountMinor, currency, unit, taxBehavior, compareAt, validFrom, validUntil, provenance, validFromProvided, validUntilProvided }
}

async function siteDefaultCurrency(db: DbClient, organizationId: string, siteId: string): Promise<CurrencyCode> {
  const site = await queryFirst<{ default_currency: string }>(db, 'SELECT default_currency FROM sites WHERE id = ? AND organization_id = ?', [siteId, organizationId])
  if (!site) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  if (!isCurrencyCode(site.default_currency)) throw new Error(`Site ${siteId} has an unsupported default currency`)
  return site.default_currency
}

// Shared by updateProduct and syncProducts, which both batch their writes
// through one executeBatch — this must return a query, never execute
// anything itself, or the two writes would no longer be atomic.
function closeActivePriceQuery(priceId: string, at: string): BatchQuery {
  return {
    query: `
      UPDATE prices
         SET valid_until = ?
       WHERE id = ?
         AND valid_from < ?
         AND (valid_until IS NULL OR valid_until > ?)
    `,
    params: [at, priceId, at, at],
  }
}

// True only if a Price row with this exact identity — id, valid_from, and
// valid_until all matching what was originally read — still exists. This is
// an identity/snapshot check, deliberately independent of either racer's own
// clock (unlike closeActivePriceQuery's time-relative WHERE, which is fine
// for performing the close itself but not for detecting whether the Price
// state read earlier is still the current one). `valid_until IS ?` gives
// null-safe comparison so an active (NULL valid_until) Price compares
// correctly. Feeding this into the Price snapshot guard (see the guarded
// updated_at expression in updateProduct and syncProducts) turns a
// concurrent close/replace into a real batch failure instead of a lost
// update.
function priceSnapshotMatchesPredicate(productId: string, price: Pick<Price, 'id' | 'valid_from' | 'valid_until'>): { sql: string; params: SqlValue[] } {
  return {
    sql: `EXISTS (
      SELECT 1
        FROM prices
       WHERE id = ?
         AND product_id = ?
         AND valid_from = ?
         AND valid_until IS ?
    )`,
    params: [price.id, productId, price.valid_from, price.valid_until],
  }
}

// True only if no Price row is currently active for this Product, evaluated
// at D1 execution time (not an application-captured timestamp) so it isn't
// racy against either caller's own clock.
function noActivePricePredicate(productId: string): { sql: string; params: SqlValue[] } {
  return {
    sql: `NOT EXISTS (
      SELECT 1
        FROM prices
       WHERE product_id = ?
         AND valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         AND (
           valid_until IS NULL
           OR valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         )
    )`,
    params: [productId],
  }
}

// True only if no *other* Price row for this Product overlaps [validFrom, validUntil).
// Same shape as the pre-read conflict queries in updateProduct/syncProducts —
// reused here so it can also feed the Price snapshot guard, not just serve as
// an early user-facing validation error.
function priceOverlapAbsentPredicate(productId: string, excludePriceId: string | null, validFrom: string, validUntil: string | null): { sql: string; params: SqlValue[] } {
  return {
    sql: `NOT EXISTS (
      SELECT 1 FROM prices
       WHERE product_id = ? AND id <> COALESCE(?, '')
         AND valid_from < COALESCE(?, '9999-12-31T23:59:59.999Z')
         AND (valid_until IS NULL OR valid_until > ?)
    )`,
    params: [productId, excludePriceId, validUntil, validFrom],
  }
}

// The Price snapshot guard is enforced by making updated_at itself compute to
// NULL when the guard fails — products.updated_at is NOT NULL in the baseline
// schema, so D1 rejects that statement and rolls back the whole batch. This
// only recognizes that specific, already-existing constraint message; any
// other error propagates unchanged.
function isPriceSnapshotConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('NOT NULL constraint failed: products.updated_at')
}

async function hydrateProductMedia(db: DbClient, siteId: string, products: Product[]): Promise<Product[]> {
  if (!products.length) return products
  const ownerIds = products.map(product => product.id)
  const placements = await loadPublicSocialMedia(db, siteId, 'product', ownerIds)
  return products.map((product) => {
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
      FROM products p ${ACTIVE_PRICE_JOIN} ${CATEGORY_JOIN}
     WHERE p.organization_id = ? AND p.site_id = ? AND p.location_id = ?
       AND p.product_type = 'standard'
       ${options.publicOnly ? 'AND p.is_visible = 1' : ''}
     ORDER BY pc.sort_order, p.sort_order, p.id
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
      FROM products p ${ACTIVE_PRICE_JOIN} ${CATEGORY_JOIN}
     WHERE p.site_id = ? AND p.is_visible = 1
       AND p.product_type = 'standard'
       ${scoped ? 'AND p.location_id IN (SELECT value FROM json_each(?))' : ''}
     ORDER BY p.location_id, pc.sort_order, p.sort_order, p.id
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
      FROM products p ${ACTIVE_PRICE_JOIN} ${CATEGORY_JOIN}
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
      FROM products p ${ACTIVE_PRICE_JOIN} ${CATEGORY_JOIN}
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

function productEvent(
  db: DbClient,
  eventType: OrganizationEventType,
  input: { organizationId: string; siteId: string; locationId: string; actor: string; productId?: string; metadata?: Record<string, unknown> },
) {
  const requestedLocationId = Object.hasOwn(input.metadata ?? {}, 'requested_location_id')
    ? input.metadata?.requested_location_id
    : input.locationId
  return fireOrganizationEventSafe({
    db,
    organizationId: input.organizationId,
    siteId: input.siteId,
    locationId: input.locationId,
    actorId: input.actor,
    eventType,
    entityType: 'product',
    entityId: input.productId,
    metadata: {
      mutation_type: eventType,
      requested_location_id: requestedLocationId,
      resolved_location_id: input.locationId,
      ...input.metadata,
    },
  })
}

export async function createProduct(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  input: CreateProductInput,
  attribution: ProductWriteAttribution,
  env: CloudflareEnv,
): Promise<Product> {
  const { actorId: actor, priceProvenance = 'manual' } = attribution
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const category = await requireProductCategory(db, organizationId, siteId, locationId, requireTrimmedProductString(input.category_id, 'category_id', PRODUCT_LIMITS.category))
  const name = requireTrimmedProductString(input.name, 'name', PRODUCT_LIMITS.name)
  if (input.description !== undefined && typeof input.description !== 'string') {
    throw new HTTPError({ statusCode: 400, statusMessage: 'description must be a string' })
  }
  const description = input.description?.trim() ?? ''
  if (description.length > PRODUCT_LIMITS.description) {
    throw new HTTPError({ statusCode: 400, statusMessage: `description must be at most ${PRODUCT_LIMITS.description} characters` })
  }
  const price = normalizePriceInput(input.price, await siteDefaultCurrency(db, organizationId, siteId), priceProvenance)
  const orderUrl = validateProductOrderUrl(input.order_url)
  const tags = validateProductTags(input.tags)
  const details = validateProductDetails(input.details)
  assertNoPriceNoteContradiction(price !== null, details)
  const seoTitle = normalizeOptionalProductString(input.seo_title, 'seo_title', PRODUCT_LIMITS.seoTitle)
  const seoDescription = normalizeOptionalProductString(input.seo_description, 'seo_description', PRODUCT_LIMITS.seoDescription)
  const canonicalUrl = validateProductCanonicalUrl(input.canonical_url)
  const robots = validateProductRobots(input.robots)
  const source = validateSource(input.source)
  const slug = await createLocationProductSlug(db, siteId, locationId, name)
  // sort_order is scoped to the category, so a new Product appends to the end of
  // its own section rather than the end of the whole location.
  const count = await queryFirst<{ count: number }>(db, `
    SELECT COUNT(*) AS count FROM products WHERE site_id = ? AND location_id = ? AND category_id = ? AND product_type = 'standard'
  `, [siteId, locationId, category.id])
  const productCount = Number(count?.count ?? 0)
  const requestedOrder = input.sort_order === undefined ? productCount : validateNonNegativeInteger(input.sort_order, 'sort_order')
  if (requestedOrder > productCount) throw new HTTPError({ statusCode: 400, statusMessage: 'sort_order must be within the category Product range' })
  const featuredSortOrder = input.featured_sort_order === undefined ? 0 : validateNonNegativeInteger(input.featured_sort_order, 'featured_sort_order')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const insert: BatchQuery = {
    query: `INSERT INTO products (
      id, organization_id, site_id, location_id, product_type, category_id, name, slug, description, order_url,
      is_visible, available, featured, featured_sort_order, sort_order, tags_json,
      details_json, seo_title, seo_description, canonical_url, robots, source,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id, organizationId, siteId, locationId, category.id, name, slug, description,
      orderUrl,
      validateOptionalBoolean(input.is_visible, 'is_visible', true),
      validateOptionalBoolean(input.available, 'available', true),
      validateOptionalBoolean(input.featured, 'featured', false),
      featuredSortOrder, requestedOrder, JSON.stringify(tags), JSON.stringify(details),
      seoTitle, seoDescription, canonicalUrl, robots, source, now, now, actor, actor,
    ],
  }
  const insertPrice: BatchQuery | null = price === null ? null : {
    query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
  }
  const priceInserts: BatchQuery[] = insertPrice ? [insertPrice] : []
  const queries: BatchQuery[] = requestedOrder === productCount
    ? [insert, ...priceInserts]
    : [
        { query: `UPDATE products SET sort_order = sort_order + ? WHERE site_id = ? AND location_id = ? AND product_type = 'standard'`, params: [REORDER_OFFSET, siteId, locationId] },
        insert,
        ...priceInserts,
        { query: `UPDATE products SET sort_order = (sort_order - ?) + CASE WHEN sort_order - ? >= ? THEN 1 ELSE 0 END WHERE site_id = ? AND location_id = ? AND product_type = 'standard' AND id <> ?`, params: [REORDER_OFFSET, REORDER_OFFSET, requestedOrder, siteId, locationId, id] },
      ]
  queries.push(publicResourceCacheInvalidationQuery(siteId, 'product.created'))
  await executeBatch(db, queries, { operation: 'create Product' })
  await productEvent(db, 'product.created', { organizationId, siteId, locationId, actor, productId: id, metadata: { category_id: category.id, name } })
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
  attribution: ProductWriteAttribution,
): Promise<Product[]> {
  const { actorId: actor, priceProvenance = 'manual' } = attribution
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > PRODUCT_LIMITS.batchCreate) {
    throw new HTTPError({ statusCode: 400, statusMessage: `products must contain between 1 and ${PRODUCT_LIMITS.batchCreate} rows` })
  }
  const existing = await queryAll<{ slug: string }>(db, `SELECT slug FROM products WHERE site_id = ? AND location_id = ?`, [siteId, locationId])
  const usedSlugs = new Set(existing.map(row => row.slug))
  const now = new Date().toISOString()
  const defaultCurrency = await siteDefaultCurrency(db, organizationId, siteId)
  const categories = await categoryLookup({ db, organizationId, siteId, locationId })
  const ids: string[] = []
  const inserts: BatchQuery[] = inputs.flatMap((input, index) => {
    const category = resolveCategory(categories, input.category_id, `products[${index}].category_id`)
    const name = requireTrimmedProductString(input.name, `products[${index}].name`, PRODUCT_LIMITS.name)
    if (input.description !== undefined && typeof input.description !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description must be a string` })
    const description = input.description?.trim() ?? ''
    if (description.length > PRODUCT_LIMITS.description) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description is too long` })
    const price = normalizePriceInput(input.price, defaultCurrency, priceProvenance, `products[${index}].price`)
    const details = validateProductDetails(input.details)
    assertNoPriceNoteContradiction(price !== null, details)
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
    const productInsert: BatchQuery = {
      query: `INSERT INTO products (
        id, organization_id, site_id, location_id, product_type, category_id, name, slug, description, order_url,
        is_visible, available, featured, featured_sort_order, sort_order, tags_json,
        details_json, seo_title, seo_description, canonical_url, robots, source,
        created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id, organizationId, siteId, locationId, category.id, name, slug, description,
        validateProductOrderUrl(input.order_url),
        validateOptionalBoolean(input.is_visible, `products[${index}].is_visible`, true),
        validateOptionalBoolean(input.available, `products[${index}].available`, true),
        validateOptionalBoolean(input.featured, `products[${index}].featured`, false),
        input.featured_sort_order === undefined ? 0 : validateNonNegativeInteger(input.featured_sort_order, `products[${index}].featured_sort_order`),
        existing.length + index, JSON.stringify(validateProductTags(input.tags)), JSON.stringify(details),
        normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
        normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
        validateProductCanonicalUrl(input.canonical_url), validateProductRobots(input.robots), validateSource(input.source),
        now, now, actor, actor,
      ],
    }
    if (price === null) return [productInsert]
    return [productInsert, {
      query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
    }]
  })
  await executeBatch(db, [...inserts, publicResourceCacheInvalidationQuery(siteId, 'product.batch_created')], { operation: 'batch create Products' })
  await productEvent(db, 'product.created', { organizationId, siteId, locationId, actor, metadata: { product_count: ids.length } })
  const created = await queryAll<ProductRow>(db, `SELECT ${PRODUCT_COLUMNS} FROM products p ${ACTIVE_PRICE_JOIN} ${CATEGORY_JOIN} WHERE p.site_id = ? AND p.location_id = ? AND p.product_type = 'standard' AND p.id IN (SELECT value FROM json_each(?)) ORDER BY pc.sort_order, p.sort_order, p.id`, [siteId, locationId, JSON.stringify(ids)])
  return hydrateProductMedia(db, siteId, created.map(mapProduct))
}

export async function syncProducts(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  inputs: SyncProductInput[],
  attribution: ProductWriteAttribution,
  setMissingUnavailable = false,
): Promise<Product[]> {
  const { actorId: actor, priceProvenance = 'manual' } = attribution
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  if (!Array.isArray(inputs) || inputs.length > PRODUCT_LIMITS.sync) throw new HTTPError({ statusCode: 400, statusMessage: `products may contain at most ${PRODUCT_LIMITS.sync} rows` })
  for (const [index, input] of inputs.entries()) {
    if (Object.hasOwn(input, 'product_id') && (typeof input.product_id !== 'string' || input.product_id.trim().length === 0)) {
      throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].product_id must be a non-empty string when provided` })
    }
  }
  const existing = await listLocationProducts(db, organizationId, siteId, locationId)
  const defaultCurrency = await siteDefaultCurrency(db, organizationId, siteId)
  const existingById = new Map(existing.map(product => [product.id, product]))
  const requestedIds = inputs.map(input => input.product_id).filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (new Set(requestedIds).size !== requestedIds.length) throw new HTTPError({ statusCode: 400, statusMessage: 'product_id values must be unique' })
  const unknownIds = requestedIds.filter(id => !existingById.has(id))
  if (unknownIds.length > 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: `Product IDs not found at this location: ${unknownIds.join(', ')}` })
  }
  const now = new Date().toISOString()
  const usedSlugs = new Set(existing.map(product => product.slug))
  // Order is per category, so sync accumulates one intended order per category.
  const orderedIds: string[] = []
  const orderByCategory = new Map<string, string[]>()
  const writes: BatchQuery[] = []
  const categories = await categoryLookup({ db, organizationId, siteId, locationId })
  for (const [index, input] of inputs.entries()) {
    const category = resolveCategory(categories, input.category_id, `products[${index}].category_id`)
    const name = requireTrimmedProductString(input.name, `products[${index}].name`, PRODUCT_LIMITS.name)
    if (input.description !== undefined && typeof input.description !== 'string') throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description must be a string` })
    const description = input.description?.trim() ?? ''
    if (description.length > PRODUCT_LIMITS.description) throw new HTTPError({ statusCode: 400, statusMessage: `products[${index}].description is too long` })
    const orderUrl = validateProductOrderUrl(input.order_url)
    const tags = validateProductTags(input.tags)
    const details = validateProductDetails(input.details)
    const price = normalizePriceInput(input.price, defaultCurrency, priceProvenance, `products[${index}].price`)
    const current = input.product_id ? existingById.get(input.product_id)! : null
    const id = current?.id ?? crypto.randomUUID()
    orderedIds.push(id)
    orderByCategory.set(category.id, [...(orderByCategory.get(category.id) ?? []), id])
    if (current) {
      const effectiveDetails = input.details === undefined ? current.details : details
      // A row that previously had no Price and a price-note transitioning
      // to a fixed Price must explicitly clear the note in the same call —
      // omitting `details` keeps it, which this correctly rejects.
      assertNoPriceNoteContradiction(price !== null, effectiveDetails)

      // Resolve this row's Price mutation (if any) first, so its guard can
      // also gate this row's own updated_at expression below. sync_products
      // asserts a complete Price state for every row it touches, so every
      // row gets a guard — including "same fixed Price, nothing to write"
      // and "no Price, staying that way" — not only rows with an actual
      // close/insert.
      let priceClose: BatchQuery | null = null
      let priceInsert: BatchQuery | null = null
      const guardParts: { sql: string; params: SqlValue[] }[] = []
      if (price === null) {
        if (current.price) {
          if (now <= current.price.valid_from) throw new HTTPError({ statusCode: 409, statusMessage: `products[${index}].price cannot close before the active Price starts` })
          // fixed -> null: exact snapshot.
          guardParts.push(priceSnapshotMatchesPredicate(id, current.price))
          priceClose = closeActivePriceQuery(current.price.id, now)
        } else {
          // null -> null: no-active-Price guard.
          guardParts.push(noActivePricePredicate(id))
        }
      } else {
        const samePrice = current.price
          && !price.validFromProvided && !price.validUntilProvided
          && current.price.amount_minor === price.amountMinor
          && current.price.currency === price.currency
          && current.price.unit === price.unit
          && current.price.tax_behavior === price.taxBehavior
          && current.price.compare_at_amount_minor === price.compareAt
        if (samePrice) {
          // fixed -> same fixed Price: exact snapshot (nothing to write).
          // samePrice is only truthy when current.price is truthy (see the
          // && chain above), so this non-null assertion is safe.
          guardParts.push(priceSnapshotMatchesPredicate(id, current.price!))
        } else {
          if (current.price && price.validFrom <= current.price.valid_from) throw new HTTPError({ statusCode: 409, statusMessage: `products[${index}].price must start after the active Price` })
          const conflict = await queryFirst<{ id: string }>(db, `SELECT id FROM prices WHERE product_id = ? AND id <> COALESCE(?, '') AND valid_from < COALESCE(?, '9999-12-31T23:59:59.999Z') AND (valid_until IS NULL OR valid_until > ?) LIMIT 1`, [id, current.price?.id ?? null, price.validUntil, price.validFrom])
          if (conflict) throw new HTTPError({ statusCode: 409, statusMessage: `products[${index}].price overlaps an existing Price` })
          // fixed -> replacement: exact snapshot AND overlap absent.
          // null -> fixed: overlap absent only (nothing to snapshot).
          if (current.price) {
            guardParts.push(priceSnapshotMatchesPredicate(id, current.price))
            priceClose = closeActivePriceQuery(current.price.id, price.validFrom)
          }
          priceInsert = {
            query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
          }
          guardParts.push(priceOverlapAbsentPredicate(id, current.price?.id ?? null, price.validFrom, price.validUntil))
        }
      }

      // Price snapshot guard (see updateProduct for the full explanation):
      // when this row's Price context is being mutated, updated_at only
      // takes its real value if that context still holds; otherwise it
      // computes to NULL, which products.updated_at's NOT NULL constraint
      // rejects, rolling back the entire sync batch.
      const updatedAtClause = guardParts.length
        ? `CASE WHEN ${guardParts.map(part => part.sql).join(' AND ')} THEN ? ELSE NULL END`
        : '?'
      const updatedAtParams = guardParts.length ? [...guardParts.flatMap(part => part.params), now] : [now]

      writes.push({
        query: `UPDATE products SET category_id=?, name=?, description=?, order_url=?, is_visible=?, available=?, featured=?, featured_sort_order=?, tags_json=?, details_json=?, seo_title=?, seo_description=?, canonical_url=?, robots=?, source='manual', updated_at=${updatedAtClause}, updated_by=? WHERE id=? AND organization_id=? AND site_id=? AND location_id=? AND product_type='standard'`,
        params: [category.id, name, input.description === undefined ? current.description : description,
          input.order_url === undefined ? current.order_url : orderUrl,
          validateOptionalBoolean(input.is_visible, `products[${index}].is_visible`, current.is_visible),
          validateOptionalBoolean(input.available, `products[${index}].available`, current.available),
          validateOptionalBoolean(input.featured, `products[${index}].featured`, current.featured),
          input.featured_sort_order === undefined ? current.featured_sort_order : validateNonNegativeInteger(input.featured_sort_order, `products[${index}].featured_sort_order`),
          JSON.stringify(input.tags === undefined ? current.tags : tags),
          JSON.stringify(input.details === undefined ? current.details : details),
          input.seo_title === undefined ? current.seo_title : normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
          input.seo_description === undefined ? current.seo_description : normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
          input.canonical_url === undefined ? current.canonical_url : validateProductCanonicalUrl(input.canonical_url),
          input.robots === undefined ? current.robots : validateProductRobots(input.robots), ...updatedAtParams, actor,
          id, organizationId, siteId, locationId],
      })
      if (priceClose) writes.push(priceClose)
      if (priceInsert) writes.push(priceInsert)
      continue
    }
    assertNoPriceNoteContradiction(price !== null, details)
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
      query: `INSERT INTO products (id, organization_id, site_id, location_id, product_type, category_id, name, slug, description, order_url, is_visible, available, featured, featured_sort_order, sort_order, tags_json, details_json, seo_title, seo_description, canonical_url, robots, source, created_at, updated_at, created_by, updated_by) VALUES (?,?,?,?,'standard',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [id, organizationId, siteId, locationId, category.id, name, slug, description, orderUrl,
        validateOptionalBoolean(input.is_visible, `products[${index}].is_visible`, true),
        validateOptionalBoolean(input.available, `products[${index}].available`, true),
        validateOptionalBoolean(input.featured, `products[${index}].featured`, false),
        input.featured_sort_order === undefined ? 0 : validateNonNegativeInteger(input.featured_sort_order, `products[${index}].featured_sort_order`),
        index, JSON.stringify(tags), JSON.stringify(details),
        normalizeOptionalProductString(input.seo_title, `products[${index}].seo_title`, PRODUCT_LIMITS.seoTitle),
        normalizeOptionalProductString(input.seo_description, `products[${index}].seo_description`, PRODUCT_LIMITS.seoDescription),
        validateProductCanonicalUrl(input.canonical_url), validateProductRobots(input.robots), validateSource(input.source), now, now, actor, actor],
    })
    if (price !== null) {
      writes.push({
        query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        params: [crypto.randomUUID(), organizationId, siteId, locationId, id, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, now],
      })
    }
  }
  const omitted = existing.filter(product => !requestedIds.includes(product.id))
  const intendedIds = [...orderedIds]
  // Products the caller omitted keep their category and trail the intended rows
  // inside it, so an omitted row never silently jumps section.
  for (const product of omitted) {
    orderedIds.push(product.id)
    orderByCategory.set(product.category_id, [...(orderByCategory.get(product.category_id) ?? []), product.id])
  }
  if (setMissingUnavailable && omitted.length > 0) {
    writes.push({
      query: `UPDATE products SET available = 0, updated_at = ?, updated_by = ? WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard' AND id NOT IN (SELECT value FROM json_each(?))`,
      params: [now, actor, organizationId, siteId, locationId, d1JsonArray(intendedIds)],
    })
  }
  for (const [categoryId, ids] of orderByCategory) {
    writes.push(denseOrderQuery('products', ids, {
      sql: `organization_id = ? AND site_id = ? AND location_id = ? AND category_id = ? AND product_type = 'standard'`,
      params: [organizationId, siteId, locationId, categoryId],
    }, actor, now))
  }
  writes.push(publicResourceCacheInvalidationQuery(siteId, 'product.synced'))
  try {
    await executeBatch(db, writes, { operation: 'sync Products' })
  } catch (error) {
    if (isPriceSnapshotConflict(error)) throw new HTTPError({ statusCode: 409, statusMessage: 'A Product Price changed concurrently; re-read the location and retry' })
    throw error
  }
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { product_count: inputs.length, omitted_count: omitted.length, set_missing_unavailable: setMissingUnavailable, mutation_type: 'sync_products', requested_location_id: locationId, resolved_location_id: locationId } })
  return listLocationProducts(db, organizationId, siteId, locationId)
}

export async function updateProduct(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  productId: string,
  input: UpdateProductInput,
  attribution: ProductWriteAttribution,
  env: CloudflareEnv,
): Promise<Product> {
  const { actorId: actor, priceProvenance = 'manual' } = attribution
  const existing = await getProduct(db, organizationId, siteId, locationId, productId)
  if (!existing) notFound()
  if (input.sort_order !== undefined && input.sort_order !== existing.sort_order) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Use move_products to change Product order' })
  }
  const sets: string[] = []
  const params: SqlValue[] = []
  const add = (column: string, value: SqlValue) => { sets.push(`${column} = ?`); params.push(value) }
  // Category membership is not a field edit. It changes only through
  // moveProductsToCategory, which keeps both categories densely ordered.
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
  const newDetails = input.details !== undefined ? validateProductDetails(input.details) : null
  if (newDetails !== null) add('details_json', JSON.stringify(newDetails))
  if (input.seo_title !== undefined) add('seo_title', normalizeOptionalProductString(input.seo_title, 'seo_title', PRODUCT_LIMITS.seoTitle))
  if (input.seo_description !== undefined) add('seo_description', normalizeOptionalProductString(input.seo_description, 'seo_description', PRODUCT_LIMITS.seoDescription))
  if (input.canonical_url !== undefined) add('canonical_url', validateProductCanonicalUrl(input.canonical_url))
  if (input.robots !== undefined) add('robots', validateProductRobots(input.robots))
  if (!sets.length && input.price === undefined) return existing
  // Validate the final intended {price, details} state together — omitting
  // either field means "keep the existing value" per this tool's patch
  // semantics, so both must be resolved before checking for contradiction.
  const effectiveDetails = newDetails ?? existing.details
  const effectiveHasFixedPrice = input.price === undefined ? existing.price !== null : input.price !== null
  assertNoPriceNoteContradiction(effectiveHasFixedPrice, effectiveDetails)
  const contentChanged = input.price !== undefined || ['category', 'name', 'description', 'order_url', 'tags_json', 'details_json'].some(column => sets.some(set => set.startsWith(`${column} =`)))
  if (contentChanged) add('source', 'manual')
  add('updated_by', actor)
  let priceInsert: BatchQuery | null = null
  let priceClose: BatchQuery | null = null
  const guardParts: { sql: string; params: SqlValue[] }[] = []
  if (input.price !== undefined) {
    const at = input.price?.valid_from ?? new Date().toISOString()
    if (existing.price && at <= existing.price.valid_from) throw new HTTPError({ statusCode: 409, statusMessage: 'Replacement Price must start after the active Price' })
    if (input.price !== null) {
      const price = normalizePriceInput({ ...input.price, valid_from: at }, await siteDefaultCurrency(db, organizationId, siteId), priceProvenance)!
      const conflict = await queryFirst<{ id: string }>(db, `
        SELECT id FROM prices
        WHERE product_id = ? AND id <> COALESCE(?, '')
          AND valid_from < COALESCE(?, '9999-12-31T23:59:59.999Z')
          AND (valid_until IS NULL OR valid_until > ?)
        LIMIT 1
      `, [productId, existing.price?.id ?? null, price.validUntil, price.validFrom])
      if (conflict) throw new HTTPError({ statusCode: 409, statusMessage: 'Scheduled Price overlaps an existing Price' })
      // fixed -> replacement: exact snapshot AND overlap absent.
      // null -> fixed: overlap absent only (nothing to snapshot).
      if (existing.price) {
        guardParts.push(priceSnapshotMatchesPredicate(productId, existing.price))
        if (existing.price.valid_until === null || existing.price.valid_until > at) {
          priceClose = closeActivePriceQuery(existing.price.id, at)
        }
      }
      const insertParams: SqlValue[] = [crypto.randomUUID(), organizationId, siteId, locationId, productId, price.amountMinor, price.currency, price.unit, price.taxBehavior, price.compareAt, price.validFrom, price.validUntil, price.provenance, actor, new Date().toISOString()]
      priceInsert = {
        query: `INSERT INTO prices (id, organization_id, site_id, location_id, product_id, amount_minor, currency, unit, tax_behavior, compare_at_amount_minor, valid_from, valid_until, provenance, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: insertParams,
      }
      guardParts.push(priceOverlapAbsentPredicate(productId, existing.price?.id ?? null, price.validFrom, price.validUntil))
    } else if (existing.price) {
      // fixed -> null: exact snapshot.
      guardParts.push(priceSnapshotMatchesPredicate(productId, existing.price))
      if (existing.price.valid_until === null || existing.price.valid_until > at) {
        priceClose = closeActivePriceQuery(existing.price.id, at)
      }
    } else {
      // null -> null: no-active-Price guard (this update still asserts "no
      // Price", so a concurrently-introduced one must still conflict).
      guardParts.push(noActivePricePredicate(productId))
    }
  }
  // The Price snapshot guard: when this update touches the Price, updated_at
  // only takes its real value if the Price context read above still holds —
  // otherwise it computes to NULL, which products.updated_at's NOT NULL
  // constraint rejects, rolling back this entire batch (see
  // isPriceSnapshotConflict below).
  if (guardParts.length) {
    const guardSql = guardParts.map(part => part.sql).join(' AND ')
    const guardParams = guardParts.flatMap(part => part.params)
    sets.push(`updated_at = CASE WHEN ${guardSql} THEN ? ELSE NULL END`)
    params.push(...guardParams, new Date().toISOString())
  } else {
    sets.push('updated_at = ?')
    params.push(new Date().toISOString())
  }
  const writes: BatchQuery[] = []
  if (sets.length) {
    params.push(productId, organizationId, siteId, locationId)
    writes.push({
      query: `UPDATE products SET ${sets.join(', ')} WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`,
      params,
    })
  }
  if (priceClose) writes.push(priceClose)
  if (priceInsert) writes.push(priceInsert)
  writes.push(publicResourceCacheInvalidationQuery(siteId, 'product.updated'))
  try {
    await executeBatch(db, writes, { operation: 'update Product' })
  } catch (error) {
    if (isPriceSnapshotConflict(error)) throw new HTTPError({ statusCode: 409, statusMessage: 'The Product Price changed concurrently; re-read the Product and retry' })
    throw error
  }
  await productEvent(db, 'product.updated', { organizationId, siteId, locationId, actor, productId, metadata: { mutation_type: 'update_product', requested_location_id: null, resolved_location_id: locationId } })
  const updated = await getProduct(db, organizationId, siteId, locationId, productId)
  if (!updated) throw new Error('Product not found after update')
  await refreshSocialCard({ db, env, owner: { owner_type: 'product', owner_id: productId }, actorId: actor })
  return updated
}


interface ProductLocationScope {
  db: DbClient
  organizationId: string
  siteId: string
  locationId: string
}

interface ProductOrderScope extends ProductLocationScope {
  actor: string
}

const CATEGORY_COLUMNS = `id, organization_id, site_id, location_id, product_type, name, slug, sort_order, created_at, updated_at, created_by, updated_by`

function mapProductCategory(row: ProductRow): ProductCategory {
  return {
    id: String(row.id),
    location_id: String(row.location_id),
    name: String(row.name),
    slug: String(row.slug),
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: String(row.created_by),
    updated_by: String(row.updated_by),
  }
}

/**
 * One read of the location's categories for batch writes, so a 200-row import
 * resolves every category_id in memory instead of per row.
 */
async function categoryLookup(scope: ProductLocationScope): Promise<Map<string, ProductCategory>> {
  const categories = await listProductCategories(scope)
  return new Map(categories.map(category => [category.id, category]))
}

function resolveCategory(categories: Map<string, ProductCategory>, categoryId: unknown, field: string): ProductCategory {
  const id = requireTrimmedProductString(categoryId, field, PRODUCT_LIMITS.category)
  const category = categories.get(id)
  if (!category) throw new HTTPError({ statusCode: 404, statusMessage: `${field} was not found at this location: ${id}` })
  return category
}

export async function listProductCategories({ db, organizationId, siteId, locationId }: ProductLocationScope): Promise<ProductCategory[]> {
  const rows = await queryAll<ProductRow>(db, `
    SELECT ${CATEGORY_COLUMNS} FROM product_categories
     WHERE organization_id = ? AND site_id = ? AND location_id = ?
       AND product_type = 'standard'
     ORDER BY sort_order, id
  `, [organizationId, siteId, locationId])
  return rows.map(mapProductCategory)
}

export async function getProductCategory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  categoryId: string,
): Promise<ProductCategory | null> {
  const row = await queryFirst<ProductRow>(db, `
    SELECT ${CATEGORY_COLUMNS} FROM product_categories
     WHERE organization_id = ? AND site_id = ? AND location_id = ? AND id = ?
       AND product_type = 'standard'
  `, [organizationId, siteId, locationId, categoryId])
  return row ? mapProductCategory(row) : null
}

/**
 * Resolves a category by id and fails loudly when it does not belong to this
 * location. Every write that accepts a caller-supplied category_id goes through
 * here so a category from another location can never be attached to a Product.
 */
export async function requireProductCategory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  categoryId: string,
): Promise<ProductCategory> {
  const category = await getProductCategory(db, organizationId, siteId, locationId, categoryId)
  if (!category) throw new HTTPError({ statusCode: 404, statusMessage: `Product category not found at this location: ${categoryId}` })
  return category
}

async function createLocationCategorySlug(db: DbClient, siteId: string, locationId: string, name: string): Promise<string> {
  const base = slugifyProductName(name)
  if (!base) throw new HTTPError({ statusCode: 400, statusMessage: 'name must produce a non-empty ASCII slug' })
  for (let suffix = 1; suffix <= MAX_SLUG_SUFFIX_ATTEMPTS; suffix += 1) {
    const suffixText = suffix === 1 ? '' : `-${suffix}`
    const candidate = `${base.slice(0, 120 - suffixText.length).replace(/-+$/g, '')}${suffixText}`
    const existing = await queryFirst(db, `
      SELECT id FROM product_categories WHERE site_id = ? AND location_id = ? AND product_type = 'standard' AND slug = ? LIMIT 1
    `, [siteId, locationId, candidate])
    if (!existing) return candidate
  }
  throw new HTTPError({ statusCode: 409, statusMessage: 'Unable to create a unique Product category slug in this location' })
}

async function assertCategoryNameAvailable(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  name: string,
  excludeCategoryId: string | null,
): Promise<void> {
  const existing = await queryFirst<{ id: string }>(db, `
    SELECT id FROM product_categories
     WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard' AND name = ?
     LIMIT 1
  `, [organizationId, siteId, locationId, name])
  if (existing && existing.id !== excludeCategoryId) {
    throw new HTTPError({ statusCode: 409, statusMessage: `A Product category named "${name}" already exists at this location` })
  }
}

export async function createProductCategory({ db, organizationId, siteId, locationId, name, actor }: ProductOrderScope & {
  name: string
}): Promise<ProductCategory> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const categoryName = requireTrimmedProductString(name, 'name', PRODUCT_LIMITS.category)
  await assertCategoryNameAvailable(db, organizationId, siteId, locationId, categoryName, null)
  const slug = await createLocationCategorySlug(db, siteId, locationId, categoryName)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const next = await queryFirst<{ next_sort_order: number }>(db, `
    SELECT COALESCE(MAX(sort_order) + 1, 0) AS next_sort_order FROM product_categories
     WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'
  `, [organizationId, siteId, locationId])
  await executeBatch(db, [
    {
      query: `INSERT INTO product_categories (id, organization_id, site_id, location_id, product_type, name, slug, sort_order, created_at, updated_at, created_by, updated_by)
              VALUES (?,?,?,?, 'standard', ?,?,?,?,?,?,?)`,
      params: [id, organizationId, siteId, locationId, categoryName, slug, Number(next?.next_sort_order ?? 0), now, now, actor, actor],
    },
    publicResourceCacheInvalidationQuery(siteId, 'product.category_created'),
  ], { operation: 'create Product category' })
  await productEvent(db, 'product.category_created', { organizationId, siteId, locationId, actor, metadata: { category_id: id, name: categoryName } })
  return await requireProductCategory(db, organizationId, siteId, locationId, id)
}

/**
 * Experiences all sit in one category per location, so this returns that row and
 * creates it on first use. It is scoped to product_type 'experience', which is
 * why it never appears in the menu-section list the CMS manages.
 */
export async function ensureExperienceCategory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  actor: string,
): Promise<string> {
  const existing = await queryFirst<{ id: string }>(db, `
    SELECT id FROM product_categories
     WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'experience'
     ORDER BY sort_order, id LIMIT 1
  `, [organizationId, siteId, locationId])
  if (existing) return existing.id
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await executeBatch(db, [{
    query: `INSERT INTO product_categories (id, organization_id, site_id, location_id, product_type, name, slug, sort_order, created_at, updated_at, created_by, updated_by)
            VALUES (?,?,?,?, 'experience', 'Experiences', 'experiences', 0, ?,?,?,?)`,
    params: [id, organizationId, siteId, locationId, now, now, actor, actor],
  }], { operation: 'create Experience category' })
  return id
}

/**
 * Resolves category names to categories, creating the ones that do not exist
 * yet, and returns them keyed by the name that was asked for. Only the AI import
 * path uses this: it reads a printed menu and knows section names, not IDs.
 * Every other writer references an existing category by ID.
 */
export async function resolveProductCategoriesByName({ db, organizationId, siteId, locationId, names, actor }: ProductOrderScope & {
  names: string[]
}): Promise<Map<string, ProductCategory>> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const existing = await listProductCategories({ db, organizationId, siteId, locationId })
  const byName = new Map(existing.map(category => [category.name, category]))
  const resolved = new Map<string, ProductCategory>()
  for (const rawName of names) {
    const name = requireTrimmedProductString(rawName, 'category', PRODUCT_LIMITS.category)
    if (resolved.has(rawName)) continue
    const found = byName.get(name)
    const category = found ?? await createProductCategory({ db, organizationId, siteId, locationId, name, actor })
    byName.set(name, category)
    resolved.set(rawName, category)
  }
  return resolved
}

export async function renameProductCategory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  categoryId: string,
  nameInput: string,
  actor: string,
): Promise<ProductCategory> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const existing = await requireProductCategory(db, organizationId, siteId, locationId, categoryId)
  const name = requireTrimmedProductString(nameInput, 'name', PRODUCT_LIMITS.category)
  if (name === existing.name) return existing
  await assertCategoryNameAvailable(db, organizationId, siteId, locationId, name, categoryId)
  const now = new Date().toISOString()
  await executeBatch(db, [
    {
      query: `UPDATE product_categories SET name = ?, updated_at = ?, updated_by = ? WHERE organization_id = ? AND site_id = ? AND location_id = ? AND id = ?`,
      params: [name, now, actor, organizationId, siteId, locationId, categoryId],
    },
    publicResourceCacheInvalidationQuery(siteId, 'product.category_renamed'),
  ], { operation: 'rename Product category' })
  await productEvent(db, 'product.category_renamed', { organizationId, siteId, locationId, actor, metadata: { category_id: categoryId, old_name: existing.name, new_name: name } })
  return await requireProductCategory(db, organizationId, siteId, locationId, categoryId)
}

/**
 * Rewrites sort_order across a complete ordered set. The caller sends the whole
 * order it intends, which is what the CMS reorder mode and the MCP reorder tools
 * both produce, so there is no insert-before arithmetic and no partial state.
 */
function denseOrderQuery(table: 'products' | 'product_categories', ids: string[], scope: { sql: string; params: SqlValue[] }, actor: string, now: string): BatchQuery {
  return {
    query: `
      WITH desired_order AS (
        SELECT CAST(key AS INTEGER) AS sort_order, value AS id
          FROM json_each(?)
      )
      UPDATE ${table}
         SET sort_order = (SELECT sort_order FROM desired_order WHERE desired_order.id = ${table}.id),
             updated_at = ?,
             updated_by = ?
       WHERE ${scope.sql}
         AND EXISTS (SELECT 1 FROM desired_order WHERE desired_order.id = ${table}.id)
    `,
    params: [d1JsonArray(ids), now, actor, ...scope.params],
  }
}

function validateCompleteOrder(existingIds: string[], orderedIds: string[], label: string): void {
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: `${label} must not contain duplicate IDs` })
  }
  const existing = new Set(existingIds)
  const unknown = orderedIds.filter(id => !existing.has(id))
  if (unknown.length > 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: `${label} contains IDs that are not at this location: ${unknown.join(', ')}` })
  }
  if (orderedIds.length !== existingIds.length) {
    const ordered = new Set(orderedIds)
    const missing = existingIds.filter(id => !ordered.has(id))
    throw new HTTPError({ statusCode: 400, statusMessage: `${label} must list every ID exactly once. Missing: ${missing.join(', ')}` })
  }
}

export async function reorderProductCategories({ db, organizationId, siteId, locationId, categoryIds, actor }: ProductOrderScope & {
  categoryIds: string[]
}): Promise<ProductCategory[]> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const existing = await listProductCategories({ db, organizationId, siteId, locationId })
  validateCompleteOrder(existing.map(category => category.id), categoryIds, 'category_ids')
  await executeBatch(db, [
    denseOrderQuery('product_categories', categoryIds, {
      sql: `organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`,
      params: [organizationId, siteId, locationId],
    }, actor, new Date().toISOString()),
    publicResourceCacheInvalidationQuery(siteId, 'product.reordered'),
  ], { operation: 'reorder Product categories' })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { category_ids: categoryIds } })
  return await listProductCategories({ db, organizationId, siteId, locationId })
}

async function categoryProductIds({ db, organizationId, siteId, locationId }: ProductLocationScope, categoryId: string): Promise<string[]> {
  const rows = await queryAll<{ id: string }>(db, `
    SELECT id FROM products
     WHERE organization_id = ? AND site_id = ? AND location_id = ? AND category_id = ?
       AND product_type = 'standard'
     ORDER BY sort_order, id
  `, [organizationId, siteId, locationId, categoryId])
  return rows.map(row => row.id)
}

export async function reorderProducts({ db, organizationId, siteId, locationId, categoryId, productIds, actor }: ProductOrderScope & {
  categoryId: string
  productIds: string[]
}): Promise<void> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  await requireProductCategory(db, organizationId, siteId, locationId, categoryId)
  const existingIds = await categoryProductIds({ db, organizationId, siteId, locationId }, categoryId)
  validateCompleteOrder(existingIds, productIds, 'product_ids')
  await executeBatch(db, [
    denseOrderQuery('products', productIds, {
      sql: `organization_id = ? AND site_id = ? AND location_id = ? AND category_id = ? AND product_type = 'standard'`,
      params: [organizationId, siteId, locationId, categoryId],
    }, actor, new Date().toISOString()),
    publicResourceCacheInvalidationQuery(siteId, 'product.reordered'),
  ], { operation: 'reorder Products' })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { category_id: categoryId, product_ids: productIds } })
}

/**
 * Moves Products into another category, appended in the order supplied. This is
 * the only way category membership changes, so a Product can never hold a
 * category_id from a different location.
 */
export async function moveProductsToCategory({ db, organizationId, siteId, locationId, productIds, categoryId, actor }: ProductOrderScope & {
  productIds: string[]
  categoryId: string
}): Promise<void> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  await requireProductCategory(db, organizationId, siteId, locationId, categoryId)
  if (productIds.length === 0) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'product_ids must contain at least one Product ID' })
  }
  if (new Set(productIds).size !== productIds.length) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'product_ids must not contain duplicate Product IDs' })
  }
  const rows = await queryAll<{ id: string; category_id: string }>(db, `
    SELECT id, category_id FROM products
     WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'
       AND id IN (SELECT value FROM json_each(?))
  `, [organizationId, siteId, locationId, d1JsonArray(productIds)])
  const found = new Set(rows.map(row => row.id))
  const unknown = productIds.filter(id => !found.has(id))
  if (unknown.length > 0) {
    throw new HTTPError({ statusCode: 404, statusMessage: `Product IDs not found at this location: ${unknown.join(', ')}` })
  }
  const sourceCategoryIds = [...new Set(rows.map(row => row.category_id))].filter(id => id !== categoryId)
  const targetIds = await categoryProductIds({ db, organizationId, siteId, locationId }, categoryId)
  const moving = new Set(productIds)
  const now = new Date().toISOString()
  // Products already in the target keep their relative order; the rest are
  // appended in the order the caller listed them.
  const finalOrder = [...targetIds.filter(id => !moving.has(id)), ...productIds]
  const queries: BatchQuery[] = [
    {
      query: `UPDATE products SET category_id = ?, updated_at = ?, updated_by = ?
               WHERE organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'
                 AND id IN (SELECT value FROM json_each(?))`,
      params: [categoryId, now, actor, organizationId, siteId, locationId, d1JsonArray(productIds)],
    },
    denseOrderQuery('products', finalOrder, {
      sql: `organization_id = ? AND site_id = ? AND location_id = ? AND category_id = ? AND product_type = 'standard'`,
      params: [organizationId, siteId, locationId, categoryId],
    }, actor, now),
  ]
  // Close the gaps the moved Products left behind so every category stays dense.
  for (const sourceCategoryId of sourceCategoryIds) {
    const remaining = (await categoryProductIds({ db, organizationId, siteId, locationId }, sourceCategoryId)).filter(id => !moving.has(id))
    queries.push(denseOrderQuery('products', remaining, {
      sql: `organization_id = ? AND site_id = ? AND location_id = ? AND category_id = ? AND product_type = 'standard'`,
      params: [organizationId, siteId, locationId, sourceCategoryId],
    }, actor, now))
  }
  queries.push(publicResourceCacheInvalidationQuery(siteId, 'product.reordered'))
  await executeBatch(db, queries, { operation: 'move Products between categories' })
  await productEvent(db, 'product.reordered', { organizationId, siteId, locationId, actor, metadata: { category_id: categoryId, product_ids: productIds } })
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
  const remainingIds = (await categoryProductIds({ db, organizationId, siteId, locationId }, existing.category_id)).filter(id => id !== productId)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: `DELETE FROM reviews WHERE product_id = ?`, params: [productId] },
    { query: `DELETE FROM media_placements WHERE owner_type = 'product' AND owner_id = ? AND organization_id = ? AND site_id = ?`, params: [productId, organizationId, siteId] },
    { query: `DELETE FROM products WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`, params: [productId, organizationId, siteId, locationId] },
    denseOrderQuery('products', remainingIds, {
      sql: `organization_id = ? AND site_id = ? AND location_id = ? AND category_id = ? AND product_type = 'standard'`,
      params: [organizationId, siteId, locationId, existing.category_id],
    }, actor, now),
    publicResourceCacheInvalidationQuery(siteId, 'product.deleted'),
  ], { operation: 'delete Product' })
  await productEvent(db, 'product.deleted', { organizationId, siteId, locationId, actor, productId, metadata: { category_id: existing.category_id } })
  return true
}

export async function deleteProductCategory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  categoryId: string,
  actor: string,
): Promise<number> {
  await assertLocationOwnership(db, organizationId, siteId, locationId)
  const category = await requireProductCategory(db, organizationId, siteId, locationId, categoryId)
  const deletedIds = await categoryProductIds({ db, organizationId, siteId, locationId }, categoryId)
  const idJson = d1JsonArray(deletedIds)
  const remainingCategoryIds = (await listProductCategories({ db, organizationId, siteId, locationId }))
    .map(row => row.id)
    .filter(id => id !== categoryId)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: `DELETE FROM reviews WHERE product_id IN (SELECT value FROM json_each(?))`, params: [idJson] },
    { query: `DELETE FROM media_placements WHERE owner_type = 'product' AND owner_id IN (SELECT value FROM json_each(?)) AND organization_id = ? AND site_id = ?`, params: [idJson, organizationId, siteId] },
    { query: `DELETE FROM products WHERE category_id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`, params: [categoryId, organizationId, siteId, locationId] },
    { query: `DELETE FROM product_categories WHERE id = ? AND organization_id = ? AND site_id = ? AND location_id = ?`, params: [categoryId, organizationId, siteId, locationId] },
    denseOrderQuery('product_categories', remainingCategoryIds, {
      sql: `organization_id = ? AND site_id = ? AND location_id = ? AND product_type = 'standard'`,
      params: [organizationId, siteId, locationId],
    }, actor, now),
    publicResourceCacheInvalidationQuery(siteId, 'product.category_deleted'),
  ], { operation: 'delete Product category' })
  await productEvent(db, 'product.category_deleted', { organizationId, siteId, locationId, actor, metadata: { category_id: categoryId, name: category.name, product_count: deletedIds.length } })
  return deletedIds.length
}
