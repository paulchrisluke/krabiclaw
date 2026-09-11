import { HTTPError } from 'nitro'
import { d1JsonArray, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { resourceLocalizationDeletionQueries } from '~/server/utils/localization'
import { loadPublicSocialMedia } from '~/server/utils/public-social-image'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { fireOrganizationEventSafe } from '~/server/utils/organization-events'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import {
  assertNoConflictingPrices,
  assertPriceShape,
  PRICE_RECURRING_INTERVALS,
  PRICE_TAX_BEHAVIORS,
  PRICE_TYPES,
  selectPrice,
  type Price,
  type PriceInput,
  type PriceSelection,
} from '~/shared/prices'
import {
  assertMetafieldDefinition,
  metafieldHandle,
  parseMetafieldValue,
  serializeMetafieldValue,
  type MetafieldDefinition,
  type MetafieldValue,
} from '~/shared/metafields'
import type {
  Collection,
  CreateCollectionInput,
  CreateProductInput,
  Product,
  ProductOption,
  ProductSource,
  ProductVariant,
  ReconcileProductInput,
  UpdateCollectionInput,
  UpdateProductInput,
} from '~/server/types/products'
import {
  PRODUCT_LIMITS,
  normalizeOptionalProductString,
  requireTrimmedProductString,
  validateProductMarketingFeatures,
  validateProductMetadata,
  validateProductOptions,
  validateProductOrderUrl,
  validateProductSlug,
  validateProductTags,
  validateProductUnitLabel,
  validateProductVariants,
  type NormalizedProductOption,
  type NormalizedProductVariant,
} from '~/server/utils/product-validation'

/**
 * The canonical catalog write and read path.
 *
 * Products belong to the organization. Where they are published, where they
 * are offered, what they cost, how they are grouped and what they are made of
 * are all relationships, loaded alongside the product and never flattened into
 * it. There is no second catalog for a vertical.
 */

const MAX_SLUG_SUFFIX_ATTEMPTS = 100

type Row = Record<string, unknown>

function notFound(message = 'Product not found'): never {
  throw new HTTPError({ statusCode: 404, statusMessage: message })
}

function invalid(message: string): never {
  throw new HTTPError({ statusCode: 400, statusMessage: message })
}

function conflict(message: string): never {
  throw new HTTPError({ statusCode: 409, statusMessage: message })
}

function parseJsonArray<T>(value: unknown, field: string): T[] {
  if (typeof value !== 'string') throw new Error(`Product ${field} is not stored as JSON`)
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error(`Product ${field} must be a JSON array`)
  return parsed as T[]
}

function parseJsonObject(value: unknown, field: string): Record<string, string> {
  if (typeof value !== 'string') throw new Error(`Product ${field} is not stored as JSON`)
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Product ${field} must be a JSON object`)
  return parsed as Record<string, string>
}

const PRODUCT_COLUMNS = `
  p.id, p.organization_id, p.name, p.slug, p.description, p.active, p.order_url, p.unit_label,
  p.marketing_features, p.tags, p.metadata, p.tax_code, p.source,
  p.created_at, p.updated_at, p.created_by, p.updated_by
`

function mapProductRow(row: Row): Product {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description),
    active: Number(row.active) === 1,
    order_url: row.order_url === null ? null : String(row.order_url),
    unit_label: row.unit_label === null ? null : String(row.unit_label),
    marketing_features: parseJsonArray<string>(row.marketing_features, 'marketing_features'),
    tags: parseJsonArray<string>(row.tags, 'tags'),
    metadata: parseJsonObject(row.metadata, 'metadata'),
    tax_code: row.tax_code === null ? null : String(row.tax_code),
    options: [],
    variants: [],
    metafields: {},
    publications: [],
    locations: [],
    collections: [],
    image: null,
    gallery: [],
    media: [],
    social_image: null,
    source: String(row.source) as ProductSource,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: String(row.created_by),
    updated_by: String(row.updated_by),
  }
}

function mapPriceRow(row: Row): Price {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    product_variant_id: String(row.product_variant_id),
    location_id: row.location_id === null ? null : String(row.location_id),
    active: Number(row.active) === 1,
    currency: String(row.currency) as CurrencyCode,
    unit_amount: Number(row.unit_amount),
    type: String(row.type) as Price['type'],
    recurring_interval: row.recurring_interval === null ? null : String(row.recurring_interval) as Price['recurring_interval'],
    recurring_interval_count: row.recurring_interval_count === null ? null : Number(row.recurring_interval_count),
    tax_behavior: String(row.tax_behavior) as Price['tax_behavior'],
    compare_at_unit_amount: row.compare_at_unit_amount === null ? null : Number(row.compare_at_unit_amount),
    valid_from_at: row.valid_from_at === null ? null : String(row.valid_from_at),
    valid_until_at: row.valid_until_at === null ? null : String(row.valid_until_at),
    source: String(row.source),
    created_by: String(row.created_by),
    updated_by: String(row.updated_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export function mapMetafieldDefinitionRow(row: Row): MetafieldDefinition {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    namespace: String(row.namespace),
    key: String(row.key),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    value_type: String(row.value_type) as MetafieldDefinition['value_type'],
    validations: JSON.parse(String(row.validations)) as MetafieldDefinition['validations'],
    localizable: Number(row.localizable) === 1,
  }
}

/**
 * Load every relationship a Product owns, in one pass per relation.
 *
 * Deliberately not a single join: variants x prices x publications x locations
 * x collections x metafields multiplies rows, and reconstructing distinct sets
 * from that product is where duplicate and dropped children come from.
 */
async function hydrate(db: DbClient, organizationId: string, products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products
  const ids = d1JsonArray(products.map(product => product.id))
  const byId = new Map(products.map(product => [product.id, product]))

  const [optionRows, valueRows, variantRows, selectionRows, priceRows, publicationRows, locationRows, collectionRows, metafieldRows] = await Promise.all([
    queryAll<Row>(db, `SELECT id, product_id, name, sort_order FROM product_options
      WHERE organization_id = ? AND product_id IN (SELECT value FROM json_each(?)) ORDER BY sort_order, id`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT id, product_id, product_option_id, value, sort_order FROM product_option_values
      WHERE organization_id = ? AND product_id IN (SELECT value FROM json_each(?)) ORDER BY sort_order, id`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT id, product_id, name, sku, active, sort_order FROM product_variants
      WHERE organization_id = ? AND product_id IN (SELECT value FROM json_each(?)) ORDER BY sort_order, id`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT product_variant_id, product_option_id, product_option_value_id FROM product_variant_option_values
      WHERE organization_id = ? AND product_id IN (SELECT value FROM json_each(?))`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT pr.* FROM prices pr
      JOIN product_variants v ON v.id = pr.product_variant_id AND v.organization_id = pr.organization_id
      WHERE pr.organization_id = ? AND v.product_id IN (SELECT value FROM json_each(?))
      ORDER BY pr.product_variant_id, pr.valid_from_at, pr.id`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT product_id, site_id, published FROM product_publications
      WHERE organization_id = ? AND product_id IN (SELECT value FROM json_each(?)) ORDER BY site_id`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT product_id, location_id, active, published FROM product_locations
      WHERE organization_id = ? AND product_id IN (SELECT value FROM json_each(?)) ORDER BY location_id`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT product_id, collection_id, sort_order FROM collection_products
      WHERE organization_id = ? AND product_id IN (SELECT value FROM json_each(?)) ORDER BY collection_id`, [organizationId, ids]),
    queryAll<Row>(db, `SELECT pm.product_id, pm.value, d.id AS definition_id, d.organization_id AS definition_org,
        d.namespace, d.key, d.name, d.description, d.value_type, d.validations, d.localizable
      FROM product_metafields pm
      JOIN metafield_definitions d ON d.id = pm.definition_id AND d.organization_id = pm.organization_id
      WHERE pm.organization_id = ? AND pm.product_id IN (SELECT value FROM json_each(?))
      ORDER BY d.namespace, d.key`, [organizationId, ids]),
  ])

  const valuesByOption = new Map<string, { id: string; value: string; sort_order: number }[]>()
  for (const row of valueRows) {
    const list = valuesByOption.get(String(row.product_option_id)) ?? []
    list.push({ id: String(row.id), value: String(row.value), sort_order: Number(row.sort_order) })
    valuesByOption.set(String(row.product_option_id), list)
  }
  for (const row of optionRows) {
    const option: ProductOption = {
      id: String(row.id), name: String(row.name), sort_order: Number(row.sort_order),
      values: valuesByOption.get(String(row.id)) ?? [],
    }
    byId.get(String(row.product_id))?.options.push(option)
  }

  const selectionsByVariant = new Map<string, Record<string, string>>()
  for (const row of selectionRows) {
    const current = selectionsByVariant.get(String(row.product_variant_id)) ?? {}
    current[String(row.product_option_id)] = String(row.product_option_value_id)
    selectionsByVariant.set(String(row.product_variant_id), current)
  }
  const pricesByVariant = new Map<string, Price[]>()
  for (const row of priceRows) {
    const list = pricesByVariant.get(String(row.product_variant_id)) ?? []
    list.push(mapPriceRow(row))
    pricesByVariant.set(String(row.product_variant_id), list)
  }
  for (const row of variantRows) {
    const variant: ProductVariant = {
      id: String(row.id), product_id: String(row.product_id), name: String(row.name),
      sku: row.sku === null ? null : String(row.sku), active: Number(row.active) === 1,
      sort_order: Number(row.sort_order),
      option_values: selectionsByVariant.get(String(row.id)) ?? {},
      prices: pricesByVariant.get(String(row.id)) ?? [],
    }
    byId.get(String(row.product_id))?.variants.push(variant)
  }

  for (const row of publicationRows) {
    byId.get(String(row.product_id))?.publications.push({ site_id: String(row.site_id), published: Number(row.published) === 1 })
  }
  for (const row of locationRows) {
    byId.get(String(row.product_id))?.locations.push({
      location_id: String(row.location_id), active: Number(row.active) === 1, published: Number(row.published) === 1,
    })
  }
  for (const row of collectionRows) {
    byId.get(String(row.product_id))?.collections.push({ collection_id: String(row.collection_id), sort_order: Number(row.sort_order) })
  }
  for (const row of metafieldRows) {
    const definition = mapMetafieldDefinitionRow({ ...row, id: row.definition_id, organization_id: row.definition_org })
    const product = byId.get(String(row.product_id))
    if (product) product.metafields[metafieldHandle(definition)] = parseMetafieldValue(definition, String(row.value))
  }
  return products
}

/**
 * Attach media for a specific site.
 *
 * Media placements are site-scoped while the catalog is organization-scoped,
 * so the caller must say which site's imagery it wants. There is no "the
 * product's image" independent of a site, and no default site is assumed.
 */
export async function hydrateProductMedia(db: DbClient, siteId: string, products: Product[]): Promise<Product[]> {
  if (!products.length) return products
  const placements = await loadPublicSocialMedia(db, siteId, 'product', products.map(product => product.id))
  return products.map((product) => {
    const socialMedia = placements.get(product.id) ?? { media: [], social_image: null }
    return {
      ...product,
      image: socialMedia.media.find(item => item.slot === 'image') ?? null,
      gallery: socialMedia.media.filter(item => item.slot === 'gallery'),
      media: socialMedia.media,
      social_image: socialMedia.social_image,
    }
  })
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getProduct(db: DbClient, organizationId: string, productId: string): Promise<Product> {
  const row = await queryFirst<Row>(db, `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.organization_id = ? AND p.id = ?`, [organizationId, productId])
  if (!row) notFound()
  const [product] = await hydrate(db, organizationId, [mapProductRow(row)])
  return product!
}

export async function listProducts(db: DbClient, organizationId: string): Promise<Product[]> {
  const rows = await queryAll<Row>(db, `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.organization_id = ? ORDER BY p.name, p.id`, [organizationId])
  return hydrate(db, organizationId, rows.map(mapProductRow))
}

/**
 * Products a site carries.
 *
 * `publishedOnly` narrows to published rows. There is no fallback to the
 * organization catalog when a site has published nothing: an empty site
 * catalog renders an empty state that says so.
 */
export async function listSiteProducts(db: DbClient, input: {
  organizationId: string; siteId: string; publishedOnly?: boolean
}): Promise<Product[]> {
  const rows = await queryAll<Row>(db, `
    SELECT ${PRODUCT_COLUMNS} FROM products p
    JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
    WHERE p.organization_id = ? AND pub.site_id = ? AND (? = 0 OR pub.published = 1)
    ORDER BY p.name, p.id
  `, [input.organizationId, input.siteId, input.publishedOnly ? 1 : 0])
  return hydrate(db, input.organizationId, rows.map(mapProductRow))
}

/** Products offered at one location. Membership is its own relationship, not a price. */
export async function listLocationProducts(db: DbClient, input: {
  organizationId: string; locationId: string; publishedOnly?: boolean
}): Promise<Product[]> {
  const rows = await queryAll<Row>(db, `
    SELECT ${PRODUCT_COLUMNS} FROM products p
    JOIN product_locations pl ON pl.product_id = p.id AND pl.organization_id = p.organization_id
    WHERE p.organization_id = ? AND pl.location_id = ? AND (? = 0 OR (pl.published = 1 AND pl.active = 1))
    ORDER BY p.name, p.id
  `, [input.organizationId, input.locationId, input.publishedOnly ? 1 : 0])
  return hydrate(db, input.organizationId, rows.map(mapProductRow))
}

export async function listCollectionProducts(db: DbClient, input: {
  organizationId: string; collectionId: string
}): Promise<Product[]> {
  const rows = await queryAll<Row>(db, `
    SELECT ${PRODUCT_COLUMNS} FROM products p
    JOIN collection_products cp ON cp.product_id = p.id AND cp.organization_id = p.organization_id
    WHERE p.organization_id = ? AND cp.collection_id = ?
    ORDER BY cp.sort_order, p.id
  `, [input.organizationId, input.collectionId])
  return hydrate(db, input.organizationId, rows.map(mapProductRow))
}

export async function getProductBySlug(db: DbClient, organizationId: string, slug: string): Promise<Product | null> {
  const row = await queryFirst<Row>(db, `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.organization_id = ? AND p.slug = ?`, [organizationId, slug])
  if (!row) return null
  const [product] = await hydrate(db, organizationId, [mapProductRow(row)])
  return product!
}

/**
 * Resolve the price a specific surface should show.
 *
 * A thin, explicit wrapper over the one selection contract, so callers state
 * their currency and location instead of reaching into `variant.prices` and
 * inventing a rule. It throws on ambiguity and returns null when no offer
 * applies — the caller renders an empty state, never a substitute.
 */
export function resolveVariantPrice(variant: ProductVariant, selection: PriceSelection): Price | null {
  return selectPrice(variant.prices, selection)
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

interface Actor { actorId: string }

function slugCandidate(base: string, attempt: number): string {
  const normalized = base.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, PRODUCT_LIMITS.slug)
  const root = normalized || 'product'
  return attempt === 0 ? root : `${root}-${attempt + 1}`
}

export async function createProductSlug(db: DbClient, organizationId: string, base: string, excludeId?: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_SLUG_SUFFIX_ATTEMPTS; attempt += 1) {
    const candidate = slugCandidate(base, attempt)
    const clash = await queryFirst<{ id: string }>(db, 'SELECT id FROM products WHERE organization_id = ? AND slug = ? AND id <> COALESCE(?, \'\')', [organizationId, candidate, excludeId ?? null])
    if (!clash) return candidate
  }
  conflict('Could not derive a unique product slug')
}

async function organizationDefaultCurrency(db: DbClient, organizationId: string, siteId?: string): Promise<CurrencyCode> {
  // Currency comes from an explicit site when the caller has one. With no site
  // context the caller must supply the currency on the price itself; there is
  // no platform default standing in for a merchant's decision.
  if (!siteId) invalid('currency is required when no site context is given')
  const site = await queryFirst<{ default_currency: string }>(db, 'SELECT default_currency FROM sites WHERE id = ? AND organization_id = ?', [siteId, organizationId])
  if (!site) notFound('Site not found')
  if (!isCurrencyCode(site.default_currency)) throw new Error(`Site ${siteId} has an unsupported default currency`)
  return site.default_currency
}

interface NormalizedPrice {
  id: string
  location_id: string | null
  active: boolean
  currency: CurrencyCode
  unit_amount: number
  type: Price['type']
  recurring_interval: Price['recurring_interval']
  recurring_interval_count: number | null
  tax_behavior: Price['tax_behavior']
  compare_at_unit_amount: number | null
  valid_from_at: string | null
  valid_until_at: string | null
  source: string
}

export function normalizePriceInput(input: PriceInput, defaultCurrency: CurrencyCode | null, field = 'price'): NormalizedPrice {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid(`${field} must be an object`)
  const currency = input.currency ?? defaultCurrency
  if (!currency || !isCurrencyCode(currency)) invalid(`${field}.currency must be a supported currency`)
  const type = input.type ?? 'one_time'
  if (!PRICE_TYPES.includes(type)) invalid(`${field}.type must be one of: ${PRICE_TYPES.join(', ')}`)
  const interval = input.recurring_interval ?? null
  if (interval !== null && !PRICE_RECURRING_INTERVALS.includes(interval)) {
    invalid(`${field}.recurring_interval must be one of: ${PRICE_RECURRING_INTERVALS.join(', ')}`)
  }
  const taxBehavior = input.tax_behavior ?? 'unspecified'
  if (!PRICE_TAX_BEHAVIORS.includes(taxBehavior)) invalid(`${field}.tax_behavior must be supported`)
  const normalized: NormalizedPrice = {
    id: crypto.randomUUID(),
    location_id: input.location_id ?? null,
    active: input.active ?? true,
    currency,
    unit_amount: input.unit_amount,
    type,
    recurring_interval: interval,
    recurring_interval_count: input.recurring_interval_count ?? null,
    tax_behavior: taxBehavior,
    compare_at_unit_amount: input.compare_at_unit_amount ?? null,
    valid_from_at: input.valid_from_at ?? null,
    valid_until_at: input.valid_until_at ?? null,
    source: input.source ?? 'manual',
  }
  // One shape validator, shared with the read path and the Stripe adapter.
  try { assertPriceShape(normalized) }
  catch (error) { invalid(`${field}: ${error instanceof Error ? error.message : String(error)}`) }
  return normalized
}

interface PlannedOption { id: string; name: string; sort_order: number; values: { id: string; value: string; sort_order: number }[] }
interface PlannedVariant {
  id: string
  name: string
  sku: string | null
  active: boolean
  sort_order: number
  /** Resolved to concrete option and value row ids. */
  option_values: Record<string, string>
  prices: NormalizedPrice[]
}

interface PlannedProduct {
  id: string
  name: string
  slug: string
  description: string
  active: boolean
  order_url: string | null
  unit_label: string | null
  marketing_features: string[]
  tags: string[]
  metadata: Record<string, string>
  tax_code: string | null
  options: PlannedOption[]
  variants: PlannedVariant[]
  metafields: Record<string, MetafieldValue>
  source: ProductSource
}

/**
 * Give every option, value and variant a concrete id before anything is
 * written.
 *
 * Ids supplied by the caller are kept. That is what makes an edit an edit: a
 * variant that keeps its id keeps the bookings and prices pointing at it,
 * rather than being deleted and recreated as a stranger.
 */
function resolveIds(options: NormalizedProductOption[], variants: NormalizedProductVariant[]): { options: PlannedOption[]; variantOptionValues: Map<string, Record<string, string>> } {
  const optionIds = new Map<string, string>()
  const valueIds = new Map<string, string>()
  const planned = options.map((option) => {
    const id = option.id ?? crypto.randomUUID()
    optionIds.set(option.id ?? option.name, id)
    return {
      id, name: option.name, sort_order: option.sort_order,
      values: option.values.map((value) => {
        const valueId = value.id ?? crypto.randomUUID()
        valueIds.set(value.id ?? value.value, valueId)
        return { id: valueId, value: value.value, sort_order: value.sort_order }
      }),
    }
  })
  const variantOptionValues = new Map<string, Record<string, string>>()
  variants.forEach((variant, index) => {
    variantOptionValues.set(variant.id ?? String(index), Object.fromEntries(
      Object.entries(variant.option_values).map(([optionKey, valueKey]) => [optionIds.get(optionKey) ?? optionKey, valueIds.get(valueKey) ?? valueKey]),
    ))
  })
  return { options: planned, variantOptionValues }
}

/**
 * Turn an input into the exact rows a product needs.
 *
 * A product with no customer-selectable options still gets one real default
 * variant. That variant is not a placeholder and not a special case in the
 * read path — every purchase, price and booking goes through variant identity,
 * so there is exactly one purchase path in the system.
 */
async function planProduct(
  db: DbClient,
  organizationId: string,
  input: CreateProductInput,
  context: { siteId?: string; existingId?: string },
): Promise<PlannedProduct> {
  const name = requireTrimmedProductString(input.name, 'name', PRODUCT_LIMITS.name)
  const options = validateProductOptions(input.options)
  const variants = input.variants === undefined
    ? [{ name, sku: null, active: true, sort_order: 0, option_values: {} } satisfies NormalizedProductVariant]
    : validateProductVariants(input.variants, options)
  if (options.length > 0 && input.variants === undefined) {
    invalid('a product with options must declare the variants that select them')
  }

  const defaultCurrency = context.siteId ? await organizationDefaultCurrency(db, organizationId, context.siteId) : null
  const declaredVariants = input.variants ?? []
  const resolved = resolveIds(options, variants)
  const plannedVariants: PlannedVariant[] = variants.map((variant, index) => ({
    id: variant.id ?? crypto.randomUUID(),
    name: variant.name,
    sku: variant.sku,
    active: variant.active,
    sort_order: variant.sort_order,
    option_values: resolved.variantOptionValues.get(variant.id ?? String(index)) ?? {},
    prices: (declaredVariants[index]?.prices ?? []).map((price, priceIndex) =>
      normalizePriceInput(price, defaultCurrency, `variants[${index}].prices[${priceIndex}]`)),
  }))

  return {
    id: context.existingId ?? crypto.randomUUID(),
    name,
    slug: await createProductSlug(db, organizationId, name, context.existingId),
    // An empty description is a real choice, not a missing field. Only its
    // length is constrained.
    description: normalizeOptionalProductString(input.description, 'description', PRODUCT_LIMITS.description) ?? '',
    active: input.active ?? true,
    order_url: validateProductOrderUrl(input.order_url),
    unit_label: validateProductUnitLabel(input.unit_label),
    marketing_features: validateProductMarketingFeatures(input.marketing_features),
    tags: validateProductTags(input.tags),
    metadata: validateProductMetadata(input.metadata),
    tax_code: normalizeOptionalProductString(input.tax_code, 'tax_code', PRODUCT_LIMITS.taxCode),
    options: resolved.options,
    variants: plannedVariants,
    metafields: input.metafields ?? {},
    source: input.source ?? 'manual',
  }
}

async function loadMetafieldDefinitions(db: DbClient, organizationId: string): Promise<Map<string, MetafieldDefinition>> {
  const rows = await queryAll<Row>(db, 'SELECT * FROM metafield_definitions WHERE organization_id = ?', [organizationId])
  return new Map(rows.map((row) => {
    const definition = mapMetafieldDefinitionRow(row)
    return [metafieldHandle(definition), definition]
  }))
}

/**
 * Build the writes for one product's rows.
 *
 * Returns queries rather than executing, so create, update, batch and
 * reconcile all commit through a single `executeBatch` and cannot leave a
 * product half-written.
 */
function productWrites(
  organizationId: string,
  planned: PlannedProduct,
  definitions: Map<string, MetafieldDefinition>,
  actor: Actor,
  now: string,
  mode: 'insert' | 'upsert',
): BatchQuery[] {
  const upsert = mode === 'upsert'
  const writes: BatchQuery[] = [{
    query: upsert
      ? `INSERT INTO products (id, organization_id, name, slug, description, active, order_url, unit_label,
             marketing_features, tags, metadata, tax_code, source, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, slug = excluded.slug, description = excluded.description,
             active = excluded.active, order_url = excluded.order_url, unit_label = excluded.unit_label,
             marketing_features = excluded.marketing_features, tags = excluded.tags, metadata = excluded.metadata,
             tax_code = excluded.tax_code, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      : `INSERT INTO products (id, organization_id, name, slug, description, active, order_url, unit_label,
             marketing_features, tags, metadata, tax_code, source, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [planned.id, organizationId, planned.name, planned.slug, planned.description, planned.active ? 1 : 0,
      planned.order_url, planned.unit_label, JSON.stringify(planned.marketing_features), JSON.stringify(planned.tags),
      JSON.stringify(planned.metadata), planned.tax_code, planned.source, now, now, actor.actorId, actor.actorId],
  }]

  for (const option of planned.options) {
    writes.push({
      query: upsert
        ? `INSERT INTO product_options (id, organization_id, product_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at`
        : `INSERT INTO product_options (id, organization_id, product_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [option.id, organizationId, planned.id, option.name, option.sort_order, now, now],
    })
    for (const value of option.values) {
      writes.push({
        query: upsert
          ? `INSERT INTO product_option_values (id, organization_id, product_id, product_option_id, value, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (id) DO UPDATE SET value = excluded.value, sort_order = excluded.sort_order, updated_at = excluded.updated_at`
          : `INSERT INTO product_option_values (id, organization_id, product_id, product_option_id, value, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [value.id, organizationId, planned.id, option.id, value.value, value.sort_order, now, now],
      })
    }
  }

  for (const variant of planned.variants) {
    writes.push({
      query: upsert
        ? `INSERT INTO product_variants (id, organization_id, product_id, name, sku, active, sort_order, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name, sku = excluded.sku, active = excluded.active,
               sort_order = excluded.sort_order, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
        : `INSERT INTO product_variants (id, organization_id, product_id, name, sku, active, sort_order, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [variant.id, organizationId, planned.id, variant.name, variant.sku, variant.active ? 1 : 0, variant.sort_order, now, now, actor.actorId, actor.actorId],
    })
    for (const [optionId, valueId] of Object.entries(variant.option_values)) {
      writes.push({
        query: `INSERT INTO product_variant_option_values (organization_id, product_id, product_variant_id, product_option_id, product_option_value_id)
                VALUES (?, ?, ?, ?, ?)`,
        params: [organizationId, planned.id, variant.id, optionId, valueId],
      })
    }
    for (const price of variant.prices) {
      writes.push({
        query: `INSERT INTO prices (id, organization_id, product_variant_id, location_id, active, currency, unit_amount, type,
                  recurring_interval, recurring_interval_count, tax_behavior, compare_at_unit_amount, valid_from_at, valid_until_at,
                  source, created_at, updated_at, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [price.id, organizationId, variant.id, price.location_id, price.active ? 1 : 0, price.currency, price.unit_amount,
          price.type, price.recurring_interval, price.recurring_interval_count, price.tax_behavior, price.compare_at_unit_amount,
          price.valid_from_at, price.valid_until_at, price.source, now, now, actor.actorId, actor.actorId],
      })
    }
  }

  for (const [handle, value] of Object.entries(planned.metafields)) {
    const definition = definitions.get(handle)
    // An undefined attribute is rejected, not stored as an untyped blob. The
    // caller creates the definition first; that is the whole extension model.
    if (!definition) invalid(`metafield "${handle}" has no definition in this organization`)
    writes.push({
      query: `INSERT INTO product_metafields (organization_id, product_id, definition_id, value, created_at, updated_at, created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [organizationId, planned.id, definition.id, serializeMetafieldValue(definition, value), now, now, actor.actorId, actor.actorId],
    })
  }
  return writes
}

function assertVariantPricesConsistent(planned: PlannedProduct): void {
  for (const variant of planned.variants) {
    if (variant.prices.length < 2) continue
    // Refuse two simultaneously-valid offers of the same scope at write time,
    // so the person creating them sees the conflict instead of a customer
    // hitting an ambiguous selection at checkout.
    assertNoConflictingPrices(variant.prices.map(price => ({
      ...price,
      organization_id: 'scope',
      product_variant_id: variant.id,
      created_by: 'scope', updated_by: 'scope', created_at: '', updated_at: '',
    })))
  }
}

export async function createProduct(db: DbClient, input: {
  organizationId: string
  siteId?: string
  product: CreateProductInput
  actor: Actor
}): Promise<Product> {
  const definitions = await loadMetafieldDefinitions(db, input.organizationId)
  const planned = await planProduct(db, input.organizationId, input.product, { siteId: input.siteId })
  assertVariantPricesConsistent(planned)
  const now = new Date().toISOString()
  await executeBatch(db, productWrites(input.organizationId, planned, definitions, input.actor, now, 'insert'), { operation: 'Create product' })
  await fireOrganizationEventSafe({ db, organizationId: input.organizationId, siteId: input.siteId ?? null, actorId: input.actor.actorId, eventType: 'product.created', entityType: 'product', entityId: planned.id })
  return getProduct(db, input.organizationId, planned.id)
}

export async function createProductsBatch(db: DbClient, input: {
  organizationId: string
  siteId?: string
  products: CreateProductInput[]
  actor: Actor
}): Promise<Product[]> {
  if (input.products.length === 0) invalid('at least one product is required')
  if (input.products.length > PRODUCT_LIMITS.batchCreate) invalid(`at most ${PRODUCT_LIMITS.batchCreate} products may be created at once`)
  const definitions = await loadMetafieldDefinitions(db, input.organizationId)
  const now = new Date().toISOString()
  const writes: BatchQuery[] = []
  const ids: string[] = []
  // Slugs are derived sequentially: deriving them in parallel would let two
  // products in one batch both take the same free slug.
  const taken = new Set<string>()
  for (const product of input.products) {
    const planned = await planProduct(db, input.organizationId, product, { siteId: input.siteId })
    while (taken.has(planned.slug)) planned.slug = await createProductSlug(db, input.organizationId, `${planned.slug}-2`)
    taken.add(planned.slug)
    assertVariantPricesConsistent(planned)
    writes.push(...productWrites(input.organizationId, planned, definitions, input.actor, now, 'insert'))
    ids.push(planned.id)
  }
  await executeBatch(db, writes, { operation: 'Create products' })
  await fireOrganizationEventSafe({ db, organizationId: input.organizationId, siteId: input.siteId ?? null, actorId: input.actor.actorId, eventType: 'product.created', entityType: 'product', metadata: { product_count: ids.length } })
  const rows = await queryAll<Row>(db, `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.organization_id = ? AND p.id IN (SELECT value FROM json_each(?))`, [input.organizationId, d1JsonArray(ids)])
  return hydrate(db, input.organizationId, rows.map(mapProductRow))
}

/**
 * Replace a product's rows with the intended state.
 *
 * Children are deleted and rewritten rather than diffed. Diffing options,
 * values, variants and prices in place is how a half-applied edit leaves a
 * variant selecting a value that no longer exists; the whole replacement
 * commits in one batch or none of it does.
 *
 * A variant that keeps its id keeps its bookings, because bookings reference
 * the variant, not its ordinal position.
 */
export async function updateProduct(db: DbClient, input: {
  organizationId: string
  siteId?: string
  productId: string
  patch: UpdateProductInput
  actor: Actor
}): Promise<Product> {
  const current = await getProduct(db, input.organizationId, input.productId)
  const definitions = await loadMetafieldDefinitions(db, input.organizationId)
  const merged: CreateProductInput = {
    name: input.patch.name ?? current.name,
    description: input.patch.description ?? current.description,
    active: input.patch.active ?? current.active,
    order_url: input.patch.order_url === undefined ? current.order_url : input.patch.order_url,
    unit_label: input.patch.unit_label === undefined ? current.unit_label : input.patch.unit_label,
    marketing_features: input.patch.marketing_features ?? current.marketing_features,
    tags: input.patch.tags ?? current.tags,
    metadata: input.patch.metadata ?? current.metadata,
    tax_code: input.patch.tax_code === undefined ? current.tax_code : input.patch.tax_code,
    options: input.patch.options ?? current.options.map(option => ({
      id: option.id, name: option.name, sort_order: option.sort_order,
      values: option.values.map(value => ({ id: value.id, value: value.value, sort_order: value.sort_order })),
    })),
    variants: input.patch.variants ?? current.variants.map(variant => ({
      id: variant.id, name: variant.name, sku: variant.sku, active: variant.active, sort_order: variant.sort_order,
      option_values: variant.option_values,
      prices: variant.prices.map(price => ({
        unit_amount: price.unit_amount, currency: price.currency, location_id: price.location_id, active: price.active,
        type: price.type, recurring_interval: price.recurring_interval, recurring_interval_count: price.recurring_interval_count,
        tax_behavior: price.tax_behavior, compare_at_unit_amount: price.compare_at_unit_amount,
        valid_from_at: price.valid_from_at, valid_until_at: price.valid_until_at, source: price.source,
      })),
    })),
    metafields: input.patch.metafields ?? current.metafields,
  }
  const planned = await planProduct(db, input.organizationId, merged, { siteId: input.siteId, existingId: input.productId })
  planned.slug = input.patch.name === undefined ? current.slug : planned.slug
  planned.source = current.source
  assertVariantPricesConsistent(planned)

  const now = new Date().toISOString()
  const keptOptions = d1JsonArray(planned.options.map(option => option.id))
  const keptValues = d1JsonArray(planned.options.flatMap(option => option.values.map(value => value.id)))
  const keptVariants = d1JsonArray(planned.variants.map(variant => variant.id))

  // A variant a booking points at cannot be removed by an edit. Deleting it
  // would cascade the booking away, which is how an editor tidying a product
  // would silently destroy a guest's seat.
  const orphaned = await queryAll<{ id: string; name: string }>(db, `
    SELECT v.id, v.name FROM product_variants v
    WHERE v.organization_id = ? AND v.product_id = ? AND v.id NOT IN (SELECT value FROM json_each(?))
      AND EXISTS (SELECT 1 FROM bookings b WHERE b.product_variant_id = v.id AND b.status <> 'cancelled')
  `, [input.organizationId, input.productId, keptVariants])
  if (orphaned.length > 0) {
    conflict(`Cancel the bookings on ${orphaned.map(variant => variant.name).join(', ')} before removing ${orphaned.length > 1 ? 'those variants' : 'that variant'}`)
  }

  const writes: BatchQuery[] = [
    // Selections, prices and metafield values are rebuilt wholesale: nothing
    // references them, so replacing them is simpler and cannot drift.
    { query: 'DELETE FROM product_metafields WHERE organization_id = ? AND product_id = ?', params: [input.organizationId, input.productId] },
    { query: 'DELETE FROM product_variant_option_values WHERE organization_id = ? AND product_id = ?', params: [input.organizationId, input.productId] },
    { query: 'DELETE FROM prices WHERE organization_id = ? AND product_variant_id IN (SELECT id FROM product_variants WHERE organization_id = ? AND product_id = ?)', params: [input.organizationId, input.organizationId, input.productId] },
    // Options, values and variants are UPSERTED, never dropped and recreated:
    // bookings reference variant identity, and recreating a variant under a
    // fresh id is the same as deleting it as far as they are concerned. Only
    // rows the caller actually removed are deleted.
    { query: 'DELETE FROM product_variants WHERE organization_id = ? AND product_id = ? AND id NOT IN (SELECT value FROM json_each(?))', params: [input.organizationId, input.productId, keptVariants] },
    { query: 'DELETE FROM product_option_values WHERE organization_id = ? AND product_id = ? AND id NOT IN (SELECT value FROM json_each(?))', params: [input.organizationId, input.productId, keptValues] },
    { query: 'DELETE FROM product_options WHERE organization_id = ? AND product_id = ? AND id NOT IN (SELECT value FROM json_each(?))', params: [input.organizationId, input.productId, keptOptions] },
    ...productWrites(input.organizationId, planned, definitions, input.actor, now, 'upsert'),
    ...(await productCacheInvalidations(db, input.organizationId, input.productId, 'product_updated')),
  ]
  await executeBatch(db, writes, { operation: 'Update product' })
  return getProduct(db, input.organizationId, input.productId)
}

export async function deleteProduct(db: DbClient, input: {
  organizationId: string; productId: string
}): Promise<void> {
  const bound = await queryAll<{ site_id: string; id: string }>(db, `
    SELECT site_id, id FROM content_documents WHERE organization_id = ? AND product_id = ?
  `, [input.organizationId, input.productId])
  // The canonical page foreign key is RESTRICT, so say why rather than letting
  // D1 return a constraint error the merchant cannot act on.
  if (bound.length > 0) {
    conflict(`Unbind or delete the product page${bound.length > 1 ? 's' : ''} for this product before deleting it`)
  }
  const invalidations = await productCacheInvalidations(db, input.organizationId, input.productId, 'product_deleted')
  await executeBatch(db, [
    ...resourceLocalizationDeletionQueries('product', { query: 'SELECT ?', params: [input.productId] }),
    ...invalidations,
    { query: 'DELETE FROM products WHERE organization_id = ? AND id = ?', params: [input.organizationId, input.productId] },
  ], { operation: 'Delete product' })
}

/**
 * Invalidate every site projection this product appears in.
 *
 * A product published on two sites has two projections; invalidating only the
 * site the editor happened to be looking at is how one of them goes stale
 * while looking correct.
 */
async function productCacheInvalidations(db: DbClient, organizationId: string, productId: string, reason: string): Promise<BatchQuery[]> {
  const sites = await queryAll<{ site_id: string }>(db, `
    SELECT site_id FROM product_publications WHERE organization_id = ? AND product_id = ?
    UNION
    SELECT site_id FROM content_documents WHERE organization_id = ? AND product_id = ?
  `, [organizationId, productId, organizationId, productId])
  return sites.map(row => publicResourceCacheInvalidationQuery(row.site_id, reason))
}

// ---------------------------------------------------------------------------
// Publication and location relationships
// ---------------------------------------------------------------------------

/**
 * Publish or withhold a product on one site.
 *
 * Three controls, none implying another: `products.active` is the merchant's
 * sale switch, this row is site visibility, and `product_locations.published`
 * is per-location visibility. A withheld product is not sold out and a
 * disabled product is not unpublished.
 */
export async function setProductPublication(db: DbClient, input: {
  organizationId: string; productId: string; siteId: string; published: boolean; actor: Actor
}): Promise<void> {
  const now = new Date().toISOString()
  await executeBatch(db, [{
    query: `INSERT INTO product_publications (organization_id, product_id, site_id, published, created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (product_id, site_id) DO UPDATE SET published = excluded.published, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    params: [input.organizationId, input.productId, input.siteId, input.published ? 1 : 0, now, now, input.actor.actorId, input.actor.actorId],
  }, publicResourceCacheInvalidationQuery(input.siteId, 'product_publication_changed')], { operation: 'Set product publication' })
}

export async function removeProductPublication(db: DbClient, input: {
  organizationId: string; productId: string; siteId: string
}): Promise<void> {
  await executeBatch(db, [
    { query: 'DELETE FROM product_publications WHERE organization_id = ? AND product_id = ? AND site_id = ?', params: [input.organizationId, input.productId, input.siteId] },
    publicResourceCacheInvalidationQuery(input.siteId, 'product_publication_changed'),
  ], { operation: 'Remove product publication' })
}

export async function setProductLocation(db: DbClient, input: {
  organizationId: string; productId: string; locationId: string; active?: boolean; published?: boolean; actor: Actor
}): Promise<void> {
  const site = await queryFirst<{ site_id: string }>(db, 'SELECT site_id FROM business_locations WHERE organization_id = ? AND id = ?', [input.organizationId, input.locationId])
  if (!site) notFound('Location not found')
  const now = new Date().toISOString()
  await executeBatch(db, [{
    query: `INSERT INTO product_locations (organization_id, product_id, location_id, active, published, created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (product_id, location_id) DO UPDATE SET active = excluded.active, published = excluded.published,
              updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    params: [input.organizationId, input.productId, input.locationId, (input.active ?? true) ? 1 : 0, (input.published ?? false) ? 1 : 0,
      now, now, input.actor.actorId, input.actor.actorId],
  }, publicResourceCacheInvalidationQuery(site.site_id, 'product_location_changed')], { operation: 'Set product location' })
}

export async function removeProductLocation(db: DbClient, input: {
  organizationId: string; productId: string; locationId: string
}): Promise<void> {
  const site = await queryFirst<{ site_id: string }>(db, 'SELECT site_id FROM business_locations WHERE organization_id = ? AND id = ?', [input.organizationId, input.locationId])
  if (!site) notFound('Location not found')
  await executeBatch(db, [
    { query: 'DELETE FROM product_locations WHERE organization_id = ? AND product_id = ? AND location_id = ?', params: [input.organizationId, input.productId, input.locationId] },
    publicResourceCacheInvalidationQuery(site.site_id, 'product_location_changed'),
  ], { operation: 'Remove product location' })
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

function mapCollectionRow(row: Row): Collection {
  return {
    id: String(row.id), site_id: String(row.site_id),
    location_id: row.location_id === null ? null : String(row.location_id),
    name: String(row.name), slug: String(row.slug),
    description: row.description === null ? null : String(row.description),
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at), updated_at: String(row.updated_at),
    created_by: String(row.created_by), updated_by: String(row.updated_by),
  }
}

export async function listCollections(db: DbClient, input: {
  organizationId: string; siteId: string; locationId?: string | null
}): Promise<Collection[]> {
  const rows = await queryAll<Row>(db, `
    SELECT * FROM collections
    WHERE organization_id = ? AND site_id = ?
      AND (? = 0 OR location_id IS ?)
    ORDER BY sort_order, name, id
  `, [input.organizationId, input.siteId, input.locationId === undefined ? 0 : 1, input.locationId ?? null])
  return rows.map(mapCollectionRow)
}

export async function createCollection(db: DbClient, input: {
  organizationId: string; collection: CreateCollectionInput; actor: Actor
}): Promise<Collection> {
  const name = requireTrimmedProductString(input.collection.name, 'name', PRODUCT_LIMITS.collectionName)
  const slug = await uniqueCollectionSlug(db, input.organizationId, input.collection.site_id, input.collection.location_id ?? null, name)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await executeBatch(db, [{
    query: `INSERT INTO collections (id, organization_id, site_id, location_id, name, slug, description, sort_order, created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, input.organizationId, input.collection.site_id, input.collection.location_id ?? null, name, slug,
      normalizeOptionalProductString(input.collection.description, 'description', PRODUCT_LIMITS.collectionDescription),
      input.collection.sort_order ?? 0, now, now, input.actor.actorId, input.actor.actorId],
  }, publicResourceCacheInvalidationQuery(input.collection.site_id, 'collection_created')], { operation: 'Create collection' })
  const row = await queryFirst<Row>(db, 'SELECT * FROM collections WHERE organization_id = ? AND id = ?', [input.organizationId, id])
  return mapCollectionRow(row!)
}

async function uniqueCollectionSlug(db: DbClient, organizationId: string, siteId: string, locationId: string | null, base: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_SLUG_SUFFIX_ATTEMPTS; attempt += 1) {
    const candidate = slugCandidate(base, attempt)
    const clash = await queryFirst<{ id: string }>(db, `
      SELECT id FROM collections WHERE organization_id = ? AND site_id = ? AND location_id IS ? AND slug = ?
    `, [organizationId, siteId, locationId, candidate])
    if (!clash) return candidate
  }
  conflict('Could not derive a unique collection slug')
}

export async function updateCollection(db: DbClient, input: {
  organizationId: string; collectionId: string; patch: UpdateCollectionInput; actor: Actor
}): Promise<Collection> {
  const existing = await queryFirst<Row>(db, 'SELECT * FROM collections WHERE organization_id = ? AND id = ?', [input.organizationId, input.collectionId])
  if (!existing) notFound('Collection not found')
  const now = new Date().toISOString()
  await executeBatch(db, [{
    query: `UPDATE collections SET name = ?, description = ?, sort_order = ?, updated_at = ?, updated_by = ?
            WHERE organization_id = ? AND id = ?`,
    params: [
      input.patch.name === undefined ? String(existing.name) : requireTrimmedProductString(input.patch.name, 'name', PRODUCT_LIMITS.collectionName),
      input.patch.description === undefined ? existing.description : normalizeOptionalProductString(input.patch.description, 'description', PRODUCT_LIMITS.collectionDescription),
      input.patch.sort_order ?? Number(existing.sort_order), now, input.actor.actorId,
      input.organizationId, input.collectionId,
    ],
  }, publicResourceCacheInvalidationQuery(String(existing.site_id), 'collection_updated')], { operation: 'Update collection' })
  const row = await queryFirst<Row>(db, 'SELECT * FROM collections WHERE organization_id = ? AND id = ?', [input.organizationId, input.collectionId])
  return mapCollectionRow(row!)
}

export async function deleteCollection(db: DbClient, input: { organizationId: string; collectionId: string }): Promise<void> {
  const existing = await queryFirst<{ site_id: string }>(db, 'SELECT site_id FROM collections WHERE organization_id = ? AND id = ?', [input.organizationId, input.collectionId])
  if (!existing) notFound('Collection not found')
  // Membership cascades; the products themselves are untouched. Deleting a
  // grouping is not deleting what was grouped.
  await executeBatch(db, [
    { query: 'DELETE FROM collections WHERE organization_id = ? AND id = ?', params: [input.organizationId, input.collectionId] },
    publicResourceCacheInvalidationQuery(existing.site_id, 'collection_deleted'),
  ], { operation: 'Delete collection' })
}

/**
 * Set a collection's complete membership and order.
 *
 * The caller supplies the whole intended list; a partial list is a different
 * operation and is rejected upstream. Position lives on the membership row, so
 * the same product can sit third here and first somewhere else without being
 * copied.
 */
export async function setCollectionProducts(db: DbClient, input: {
  organizationId: string; collectionId: string; productIds: string[]; actor: Actor
}): Promise<void> {
  if (input.productIds.length > PRODUCT_LIMITS.collectionProducts) {
    invalid(`a collection may hold at most ${PRODUCT_LIMITS.collectionProducts} products`)
  }
  if (new Set(input.productIds).size !== input.productIds.length) invalid('product_ids must be unique')
  const collection = await queryFirst<{ site_id: string }>(db, 'SELECT site_id FROM collections WHERE organization_id = ? AND id = ?', [input.organizationId, input.collectionId])
  if (!collection) notFound('Collection not found')
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: 'DELETE FROM collection_products WHERE organization_id = ? AND collection_id = ?', params: [input.organizationId, input.collectionId] },
    ...input.productIds.map((productId, index): BatchQuery => ({
      query: `INSERT INTO collection_products (organization_id, collection_id, product_id, sort_order, created_at, updated_at, created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [input.organizationId, input.collectionId, productId, index, now, now, input.actor.actorId, input.actor.actorId],
    })),
    publicResourceCacheInvalidationQuery(collection.site_id, 'collection_membership_changed'),
  ], { operation: 'Set collection products' })
}

export async function reorderCollections(db: DbClient, input: {
  organizationId: string; siteId: string; locationId?: string | null; collectionIds: string[]; actor: Actor
}): Promise<void> {
  const existing = await listCollections(db, { organizationId: input.organizationId, siteId: input.siteId, locationId: input.locationId })
  const intended = new Set(input.collectionIds)
  // A partial order would leave the unnamed collections at whatever position
  // they had, which is not an order anyone chose.
  if (intended.size !== existing.length || existing.some(collection => !intended.has(collection.id))) {
    invalid('collection_ids must list every collection in this scope exactly once')
  }
  const now = new Date().toISOString()
  await executeBatch(db, [
    ...input.collectionIds.map((collectionId, index): BatchQuery => ({
      query: 'UPDATE collections SET sort_order = ?, updated_at = ?, updated_by = ? WHERE organization_id = ? AND id = ?',
      params: [index, now, input.actor.actorId, input.organizationId, collectionId],
    })),
    publicResourceCacheInvalidationQuery(input.siteId, 'collection_reordered'),
  ], { operation: 'Reorder collections' })
}

// ---------------------------------------------------------------------------
// Metafield definitions
// ---------------------------------------------------------------------------

export async function listMetafieldDefinitions(db: DbClient, organizationId: string): Promise<MetafieldDefinition[]> {
  const rows = await queryAll<Row>(db, 'SELECT * FROM metafield_definitions WHERE organization_id = ? ORDER BY namespace, key', [organizationId])
  return rows.map(mapMetafieldDefinitionRow)
}

export async function createMetafieldDefinition(db: DbClient, input: {
  organizationId: string
  definition: Omit<MetafieldDefinition, 'id' | 'organization_id'>
  actor: Actor
}): Promise<MetafieldDefinition> {
  assertMetafieldDefinition(input.definition)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await executeBatch(db, [{
    query: `INSERT INTO metafield_definitions (id, organization_id, namespace, key, name, description, value_type, validations, localizable, created_at, updated_at, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, input.organizationId, input.definition.namespace, input.definition.key, input.definition.name,
      input.definition.description, input.definition.value_type, JSON.stringify(input.definition.validations),
      input.definition.localizable ? 1 : 0, now, now, input.actor.actorId, input.actor.actorId],
  }], { operation: 'Create metafield definition' })
  const row = await queryFirst<Row>(db, 'SELECT * FROM metafield_definitions WHERE organization_id = ? AND id = ?', [input.organizationId, id])
  return mapMetafieldDefinitionRow(row!)
}

export async function deleteMetafieldDefinition(db: DbClient, input: { organizationId: string; definitionId: string }): Promise<void> {
  // Values cascade. Removing an attribute from the vocabulary removes it from
  // every product that carried it, which is the point of doing it.
  await executeBatch(db, [{
    query: 'DELETE FROM metafield_definitions WHERE organization_id = ? AND id = ?',
    params: [input.organizationId, input.definitionId],
  }], { operation: 'Delete metafield definition' })
}

/**
 * Idempotent upsert keyed by the caller's own product id.
 *
 * Used by imports and MCP, where the same source runs twice and must converge
 * rather than duplicate. A row with a `product_id` that already exists is
 * replaced with the intended state; one without is created. Products the
 * caller did not mention are left alone unless `deactivateMissing` is set, in
 * which case they are DEACTIVATED — the merchant's sale switch — never
 * deleted, and never marked sold out, which is a stock statement this
 * operation has no basis to make.
 */
export async function reconcileProducts(db: DbClient, input: {
  organizationId: string
  siteId?: string
  products: ReconcileProductInput[]
  actor: Actor
  deactivateMissing?: boolean
}): Promise<Product[]> {
  if (!Array.isArray(input.products)) invalid('products must be an array')
  if (input.products.length > PRODUCT_LIMITS.reconcile) invalid(`products may contain at most ${PRODUCT_LIMITS.reconcile} rows`)
  input.products.forEach((product, index) => {
    if (Object.hasOwn(product, 'product_id') && (typeof product.product_id !== 'string' || product.product_id.trim() === '')) {
      invalid(`products[${index}].product_id must be a non-empty string when provided`)
    }
  })

  const touched: string[] = []
  for (const entry of input.products) {
    const { product_id: productId, ...rest } = entry
    const existing = productId
      ? await queryFirst<{ id: string }>(db, 'SELECT id FROM products WHERE organization_id = ? AND id = ?', [input.organizationId, productId])
      : null
    if (existing) {
      await updateProduct(db, { organizationId: input.organizationId, siteId: input.siteId, productId: existing.id, patch: rest, actor: input.actor })
      touched.push(existing.id)
      continue
    }
    const definitions = await loadMetafieldDefinitions(db, input.organizationId)
    const planned = await planProduct(db, input.organizationId, rest, { siteId: input.siteId, existingId: productId })
    assertVariantPricesConsistent(planned)
    await executeBatch(db, productWrites(input.organizationId, planned, definitions, input.actor, new Date().toISOString(), 'insert'), { operation: 'Reconcile product' })
    touched.push(planned.id)
  }

  if (input.deactivateMissing) {
    const now = new Date().toISOString()
    await executeBatch(db, [{
      query: `UPDATE products SET active = 0, updated_at = ?, updated_by = ?
              WHERE organization_id = ? AND id NOT IN (SELECT value FROM json_each(?))`,
      params: [now, input.actor.actorId, input.organizationId, d1JsonArray(touched)],
    }], { operation: 'Deactivate products missing from reconcile' })
  }

  const rows = await queryAll<Row>(db, `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.organization_id = ? AND p.id IN (SELECT value FROM json_each(?)) ORDER BY p.name, p.id`, [input.organizationId, d1JsonArray(touched)])
  return hydrate(db, input.organizationId, rows.map(mapProductRow))
}
