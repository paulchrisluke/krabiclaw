import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, resolvedMediaAssetObject, siteTool } from './shared'
import { PRODUCT_LIMITS } from '~/server/utils/product-validation'
import { SUPPORTED_CURRENCIES } from '~/shared/currencies'
import { METAFIELD_VALUE_TYPES } from '~/shared/metafields'
import { PRICE_RECURRING_INTERVALS, PRICE_TAX_BEHAVIORS, PRICE_TYPES } from '~/shared/prices'

/**
 * The catalog tool surface.
 *
 * These schemas are generated from the same registries the runtime validates
 * against, so a tool cannot advertise a value the writer rejects. Every
 * contract here speaks the canonical model: a product belongs to the
 * organization, a variant is what gets bought, a price belongs to a variant,
 * and where it is sold and shown are explicit relationships.
 */

const priceObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    location_id: { type: ['string', 'null'], description: 'The location this offer applies at, or null for a location-neutral offer. Null is a declared scope, not a missing value.' },
    active: { type: 'boolean' },
    currency: { type: 'string' },
    unit_amount: { type: 'integer', description: 'Integer amount in the currency smallest unit.' },
    type: { type: 'string', enum: [...PRICE_TYPES] },
    recurring_interval: { type: ['string', 'null'], enum: [...PRICE_RECURRING_INTERVALS, null] },
    recurring_interval_count: { type: ['integer', 'null'] },
    tax_behavior: { type: 'string', enum: [...PRICE_TAX_BEHAVIORS] },
    compare_at_unit_amount: { type: ['integer', 'null'] },
    valid_from_at: { type: ['string', 'null'] },
    valid_until_at: { type: ['string', 'null'] },
  },
  required: ['id', 'location_id', 'active', 'currency', 'unit_amount', 'type', 'tax_behavior'],
} as const

const priceWrite = {
  type: 'object',
  description: 'A monetary offer on this variant. unit_amount is an integer in the currency smallest unit; 0 is an explicit free offer, and a variant with no price is not purchasable rather than free. Billing recurrence describes when the customer is charged, never when a class runs.',
  properties: {
    unit_amount: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES] },
    location_id: { type: ['string', 'null'], description: 'Scope this offer to one location, or null for every location the product is offered at.' },
    active: { type: 'boolean' },
    type: { type: 'string', enum: [...PRICE_TYPES] },
    recurring_interval: { type: ['string', 'null'], enum: [...PRICE_RECURRING_INTERVALS, null] },
    recurring_interval_count: { type: ['integer', 'null'], minimum: 1 },
    tax_behavior: { type: 'string', enum: [...PRICE_TAX_BEHAVIORS] },
    compare_at_unit_amount: { type: ['integer', 'null'], minimum: 0 },
    valid_from_at: { type: ['string', 'null'], format: 'date-time' },
    valid_until_at: { type: ['string', 'null'], format: 'date-time' },
  },
  required: ['unit_amount'],
  additionalProperties: false,
} as const

const optionValueWrite = {
  type: 'object',
  properties: { id: { type: 'string' }, value: { type: 'string' }, sort_order: { type: 'integer' } },
  required: ['value'],
  additionalProperties: false,
} as const

const optionWrite = {
  type: 'object',
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, sort_order: { type: 'integer' },
    values: { type: 'array', minItems: 1, maxItems: PRODUCT_LIMITS.optionValues, items: optionValueWrite },
  },
  required: ['name', 'values'],
  additionalProperties: false,
} as const

const variantWrite = {
  type: 'object',
  description: 'One buyable configuration. A product with no options still has exactly one. Keep the id when editing: a variant that keeps its id keeps its bookings.',
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, sku: { type: ['string', 'null'] },
    active: { type: 'boolean' }, sort_order: { type: 'integer' },
    option_values: { type: 'object', additionalProperties: { type: 'string' }, description: 'Option id to option value id. Every option must be answered exactly once, and no two variants may answer identically.' },
    prices: { type: 'array', maxItems: 20, items: priceWrite },
  },
  required: ['name'],
  additionalProperties: false,
} as const

const variantObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, product_id: { type: 'string' }, name: { type: 'string' },
    sku: { type: ['string', 'null'] }, active: { type: 'boolean' }, sort_order: { type: 'integer' },
    option_values: { type: 'object', additionalProperties: { type: 'string' } },
    prices: { type: 'array', items: priceObject },
  },
  required: ['id', 'product_id', 'name', 'sku', 'active', 'sort_order', 'option_values', 'prices'],
} as const

const optionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, sort_order: { type: 'integer' },
    values: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, value: { type: 'string' }, sort_order: { type: 'integer' } }, required: ['id', 'value', 'sort_order'] } },
  },
  required: ['id', 'name', 'sort_order', 'values'],
} as const

const publicationObject = {
  type: 'object',
  properties: { site_id: { type: 'string' }, published: { type: 'boolean' } },
  required: ['site_id', 'published'],
} as const

const productLocationObject = {
  type: 'object',
  properties: { location_id: { type: 'string' }, active: { type: 'boolean' }, published: { type: 'boolean' } },
  required: ['location_id', 'active', 'published'],
} as const

const collectionMembershipObject = {
  type: 'object',
  properties: { collection_id: { type: 'string' }, sort_order: { type: 'integer' } },
  required: ['collection_id', 'sort_order'],
} as const

const collectionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, site_id: { type: 'string' }, location_id: { type: ['string', 'null'] },
    name: { type: 'string' }, slug: { type: 'string' }, description: { type: ['string', 'null'] },
    sort_order: { type: 'integer' },
  },
  required: ['id', 'site_id', 'location_id', 'name', 'slug', 'description', 'sort_order'],
} as const

const metafieldDefinitionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, namespace: { type: 'string' }, key: { type: 'string' }, name: { type: 'string' },
    description: { type: ['string', 'null'] }, value_type: { type: 'string', enum: [...METAFIELD_VALUE_TYPES] },
    validations: { type: 'object' }, localizable: { type: 'boolean' },
  },
  required: ['id', 'namespace', 'key', 'name', 'value_type', 'validations', 'localizable'],
} as const

const productObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' }, description: { type: 'string' },
    active: { type: 'boolean', description: 'The merchant sale switch. Not visibility and not stock: a disabled product is not sold out.' },
    order_url: { type: ['string', 'null'] }, unit_label: { type: ['string', 'null'] },
    marketing_features: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    metadata: { type: 'object', additionalProperties: { type: 'string' } },
    tax_code: { type: ['string', 'null'] },
    options: { type: 'array', items: optionObject },
    variants: { type: 'array', items: variantObject },
    metafields: { type: 'object', description: 'Typed descriptive attributes keyed by "<namespace>.<key>".' },
    publications: { type: 'array', items: publicationObject },
    locations: { type: 'array', items: productLocationObject },
    collections: { type: 'array', items: collectionMembershipObject },
    image: { ...resolvedMediaAssetObject, type: ['object', 'null'] },
    gallery: { type: 'array', items: resolvedMediaAssetObject },
    source: { type: 'string', enum: ['manual', 'template', 'ai', 'import', 'copy'] },
    created_at: { type: 'string' }, updated_at: { type: 'string' },
  },
  required: ['id', 'name', 'slug', 'description', 'active', 'options', 'variants', 'metafields', 'publications', 'locations', 'collections', 'source', 'created_at', 'updated_at'],
} as const

const productListItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' }, description: { type: 'string' },
    active: { type: 'boolean' }, variant_count: { type: 'integer' },
    publications: { type: 'array', items: publicationObject },
    locations: { type: 'array', items: productLocationObject },
  },
  required: ['id', 'name', 'slug', 'description', 'active', 'variant_count', 'publications', 'locations'],
} as const

const productWrite = {
  name: { type: 'string' },
  description: { type: 'string' },
  active: { type: 'boolean', description: 'Enable or disable sale of this product. Independent of site and location publication.' },
  order_url: { type: ['string', 'null'], description: 'A narrow ordering destination such as a delivery partner. Not the public product page.' },
  unit_label: { type: ['string', 'null'], description: 'A unit noun such as "person" or "night". Never pricing prose.' },
  marketing_features: { type: 'array', maxItems: PRODUCT_LIMITS.marketingFeatures, items: { type: 'string' }, description: 'Generic selling bullets. Inclusions, preparation instructions and policies are separate metafields.' },
  tags: { type: 'array', maxItems: PRODUCT_LIMITS.tags, items: { type: 'string' } },
  metadata: { type: 'object', additionalProperties: { type: 'string' }, description: 'Opaque string annotations for integrations. No pricing, scheduling, stock or filtering behavior may read these.' },
  tax_code: { type: ['string', 'null'] },
  options: { type: 'array', maxItems: PRODUCT_LIMITS.options, items: optionWrite },
  variants: { type: 'array', minItems: 1, maxItems: PRODUCT_LIMITS.variants, items: variantWrite, description: 'Omit to create a single default variant. Required once the product has options.' },
  metafields: { type: 'object', description: 'Values keyed by "<namespace>.<key>". The definition must already exist; create it with create_metafield_definition.' },
} as const

const productResult = { type: 'object', properties: { product: productObject }, required: ['product'] } as const

export const PRODUCTS_TOOLS: McpToolDefinition[] = [
  siteTool({ name: 'list_products', description: 'List the products this site carries, published or withheld. The catalog belongs to the organization; a site carries a product through an explicit publication row.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { published_only: { type: 'boolean' }, ...paginationInputSchema }, required: [], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject }, page_info: pageInfoObject }, required: ['products', 'page_info'] } }),
  siteTool({ name: 'list_location_products', description: 'List the products offered at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, published_only: { type: 'boolean' }, ...paginationInputSchema }, required: ['location_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject }, page_info: pageInfoObject }, required: ['products', 'page_info'] } }),
  siteTool({ name: 'get_product', description: 'Get a product with its options, variants, prices, publication, locations, collection membership and metafields.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'create_product', description: 'Create a product in the organization catalog and have this site carry it. Carrying is not publishing: use set_product_publication to make it visible.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { ...productWrite }, required: ['name'], outputSchema: productResult }),
  siteTool({ name: 'update_product', description: 'Replace a product with the intended state. Options, variants and prices are supplied whole; keep a variant id to keep its bookings. Removing a variant that has live bookings is refused.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, ...productWrite }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'delete_product', description: 'Delete a product and everything it owns. Refused while a canonical product page still points at it.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  siteTool({ name: 'set_product_publication', description: 'Publish or withhold a product on this site. Independent of the merchant sale switch and of location publication.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, published: { type: 'boolean' } }, required: ['product_id', 'published'], outputSchema: productResult }),
  siteTool({ name: 'set_product_location', description: 'Say whether one location offers a product, and whether it shows on that location surfaces. A price does not establish where a product is sold.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, location_id: { type: 'string' }, active: { type: 'boolean' }, published: { type: 'boolean' } }, required: ['product_id', 'location_id'], outputSchema: productResult }),
  siteTool({ name: 'remove_product_location', description: 'Stop offering a product at one location. The product and its other locations are untouched.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { product_id: { type: 'string' }, location_id: { type: 'string' } }, required: ['product_id', 'location_id'], outputSchema: productResult }),
  siteTool({ name: 'batch_create_products', description: 'Validate every row, then create all products atomically. Any invalid row rolls back the complete request.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { products: { type: 'array', minItems: 1, maxItems: PRODUCT_LIMITS.batchCreate, items: { type: 'object', properties: productWrite, required: ['name'], additionalProperties: false } } }, required: ['products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  siteTool({ name: 'reconcile_products', description: 'Create and update the supplied products in one idempotent pass, keyed by product_id. Products omitted from the request are left alone unless deactivate_missing is true, which turns off their sale switch — it never deletes them and never claims they are sold out.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { products: { type: 'array', maxItems: PRODUCT_LIMITS.reconcile, items: { type: 'object', properties: { product_id: { type: 'string', minLength: 1 }, ...productWrite }, required: ['name'], additionalProperties: false } }, deactivate_missing: { type: 'boolean' } }, required: ['products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),

  siteTool({ name: 'list_collections', description: 'List this site merchandising collections, in the order customers see them. Omit location_id for every collection; send it to narrow to one location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: ['string', 'null'] } }, required: [], outputSchema: { type: 'object', properties: { collections: { type: 'array', items: collectionObject } }, required: ['collections'] } }),
  siteTool({ name: 'create_collection', description: 'Create an empty collection. Products are added to it afterwards with set_collection_products.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { name: { type: 'string' }, description: { type: ['string', 'null'] }, location_id: { type: ['string', 'null'], description: 'Narrow this collection to one location, or omit for site-wide.' }, sort_order: { type: 'integer' } }, required: ['name'], outputSchema: { type: 'object', properties: { collection: collectionObject }, required: ['collection'] } }),
  siteTool({ name: 'update_collection', description: 'Rename a collection or change its description or position.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { collection_id: { type: 'string' }, name: { type: 'string' }, description: { type: ['string', 'null'] }, sort_order: { type: 'integer' } }, required: ['collection_id'], outputSchema: { type: 'object', properties: { collection: collectionObject }, required: ['collection'] } }),
  siteTool({ name: 'delete_collection', description: 'Delete a collection. The products in it are untouched.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { collection_id: { type: 'string' } }, required: ['collection_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  siteTool({ name: 'set_collection_products', description: 'Replace the membership and order of one collection with exactly the product ids you send, in that order. Anything you leave out is removed from this collection — the products themselves are untouched. Position lives on the membership, so the same product can sit third here and first elsewhere.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { collection_id: { type: 'string' }, product_ids: { type: 'array', items: { type: 'string' }, maxItems: PRODUCT_LIMITS.collectionProducts } }, required: ['collection_id', 'product_ids'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject } }, required: ['products'] } }),
  siteTool({ name: 'reorder_collections', description: 'Change the order of whole collections. Send every collection id in the scope exactly once, in the intended order; a partial order is rejected.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { collection_ids: { type: 'array', items: { type: 'string' }, minItems: 1 }, location_id: { type: ['string', 'null'] } }, required: ['collection_ids'], outputSchema: { type: 'object', properties: { collections: { type: 'array', items: collectionObject } }, required: ['collections'] } }),

  siteTool({ name: 'list_metafield_definitions', description: 'List the tenant descriptive product attribute vocabulary. Adding an attribute of a supported type is one definition here, not a schema change.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: {}, required: [], outputSchema: { type: 'object', properties: { definitions: { type: 'array', items: metafieldDefinitionObject } }, required: ['definitions'] } }),
  siteTool({ name: 'create_metafield_definition', description: 'Define a product attribute: its name, type, constraints and whether it may be translated. Values are set on products through metafields.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { namespace: { type: 'string' }, key: { type: 'string' }, name: { type: 'string' }, description: { type: ['string', 'null'] }, value_type: { type: 'string', enum: [...METAFIELD_VALUE_TYPES] }, validations: { type: 'object' }, localizable: { type: 'boolean' } }, required: ['namespace', 'key', 'name', 'value_type'], outputSchema: { type: 'object', properties: { definition: metafieldDefinitionObject }, required: ['definition'] } }),
  siteTool({ name: 'delete_metafield_definition', description: 'Remove an attribute from the vocabulary. Its value is removed from every product that carried it.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { definition_id: { type: 'string' } }, required: ['definition_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
]
