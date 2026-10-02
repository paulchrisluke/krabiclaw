import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, resolvedMediaAssetObject, organizationTool } from './shared'
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
  properties: { organization_id: { type: 'string' }, published: { type: 'boolean' } },
  required: ['organization_id', 'published'],
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
    id: { type: 'string' }, organization_id: { type: 'string' }, location_id: { type: ['string', 'null'] },
    name: { type: 'string' }, slug: { type: 'string' }, description: { type: ['string', 'null'] },
    sort_order: { type: 'integer' },
  },
  required: ['id', 'organization_id', 'location_id', 'name', 'slug', 'description', 'sort_order'],
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

const bookingConfigObject = {
  type: ['object', 'null'],
  properties: { product_id: { type: 'string' }, organization_id: { type: 'string' }, duration_minutes: { type: ['integer', 'null'], minimum: 1 }, default_capacity: { type: ['integer', 'null'], minimum: 0 } },
  required: ['duration_minutes', 'default_capacity'],
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
    booking: bookingConfigObject,
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
  metafields: { type: 'object', description: 'Complete replacement map keyed by "<namespace>.<key>"; preserve all entries you want to keep. Remove an entry to clear its value; use {} when no entries remain, never null values. For a literal price such as "Market price", set "pricing.note" to the exact user-provided text and send empty prices arrays for every variant. Numeric prices and pricing.note are mutually exclusive; clear pricing.note when adding numeric prices. Text-only prices display publicly but cannot be checked out. The definition must already exist; create it with create_metafield_definition.' },
} as const

const productResult = { type: 'object', properties: { product: productObject }, required: ['product'] } as const

export const PRODUCTS_TOOLS: McpToolDefinition[] = [
  organizationTool({ name: 'set_product_booking_config', description: "Set product duration and capacity defaults when the user wants to configure new bookable sessions. Existing sessions keep their saved times, capacity and state. Omitted fields stay unchanged; null clears a default and zero capacity means no places. Read the defaults with get_product.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, duration_minutes: { type: ['integer', 'null'], minimum: 1 }, default_capacity: { type: ['integer', 'null'], minimum: 0 } }, required: ['product_id'], outputSchema: { type: 'object', properties: { config: bookingConfigObject }, required: ['config'] } }),
  organizationTool({ name: 'delete_product_booking_config', description: 'Disable booking for a carried product. Refused whenever any booking history exists, including cancelled bookings.', domain: 'products', minimumRole: 'admin', confirmRequired: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  organizationTool({ name: 'replace_product_weekly_schedule', description: "Replace a product’s weekly time slots at one location when the user wants to change its recurring schedule. Uses the location timezone and product duration/capacity. An empty slots array clears the schedule. Sessions with any booking history are preserved; removed future sessions without bookings are cancelled, and re-added unbooked slots can reopen with current defaults.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, location_id: { type: 'string' }, slots: { type: 'array', items: { type: 'object', properties: { weekday: { type: 'integer', minimum: 0, maximum: 6 }, start_time: { type: 'string', description: 'Local HH:mm time.' } }, required: ['weekday', 'start_time'], additionalProperties: false } } }, required: ['product_id', 'location_id', 'slots'], outputSchema: { type: 'object', properties: { rules: { type: 'array', items: { type: 'object' } }, sessions: { type: 'object', properties: { created: { type: 'integer' }, existing: { type: 'integer' }, skipped: { type: 'array', items: { type: 'object' } } }, required: ['created', 'existing', 'skipped'] }, cancelled: { type: 'integer' } }, required: ['rules', 'sessions', 'cancelled'] } }),
  organizationTool({ name: 'list_products', description: "List products carried by the selected site, published or withheld. Results include products across the site; list_location_products narrows to one location.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { published_only: { type: 'boolean' }, ...paginationInputSchema }, required: [], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject }, page_info: pageInfoObject }, required: ['products', 'page_info'] } }),
  organizationTool({ name: 'list_location_products', description: 'List the products offered at one explicit location.', domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, published_only: { type: 'boolean' }, ...paginationInputSchema }, required: ['location_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject }, page_info: pageInfoObject }, required: ['products', 'page_info'] } }),
  organizationTool({ name: 'get_product', description: "Read one site product before reviewing or editing its options, variants, prices, media, publication, locations, collections, attributes or booking defaults. Prices belong to variants; booking defaults apply to new sessions.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: productResult }),
  organizationTool({ name: 'create_product', description: "Create a product with options, variants and prices when the user wants to add an item to the selected site’s catalog. The new product is unpublished; use set_product_publication and set_product_location to control website visibility and location offerings.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { ...productWrite }, required: ['name'], outputSchema: productResult }),
  organizationTool({ name: 'update_product', description: "Edit an existing product’s details, options, variants, prices or attributes. Only supplied fields change; supplied options, variants, prices and metafields replace their existing values. Preserve IDs for variants to retain. Removing a variant with any booking history is refused. Publication and location offerings use separate tools.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, ...productWrite }, required: ['product_id'], outputSchema: productResult }),
  organizationTool({ name: 'delete_product', description: "Permanently delete a product and its owned variants, prices, attributes and placements when the user requests its removal. Refused if the product has booking history or a site page still references it. Withhold publication or disable sale to retain the product.", domain: 'products', minimumRole: 'admin', confirmRequired: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  organizationTool({ name: 'set_product_publication', description: "Publish or withhold a product when the user wants to change its visibility on the selected site. This setting is independent of whether the product is available for sale and of visibility at individual locations.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, published: { type: 'boolean' } }, required: ['product_id', 'published'], outputSchema: productResult }),
  organizationTool({ name: 'set_product_location', description: "Set whether the selected location offers a product and whether it appears on that location’s website surfaces. Existing product prices do not establish a location offering.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, location_id: { type: 'string' }, active: { type: 'boolean' }, published: { type: 'boolean' } }, required: ['product_id', 'location_id'], outputSchema: productResult }),
  organizationTool({ name: 'remove_product_location', description: 'Stop offering a product at one location. The product and its other locations are untouched.', domain: 'products', minimumRole: 'admin', confirmRequired: true, inputSchema: { product_id: { type: 'string' }, location_id: { type: 'string' } }, required: ['product_id', 'location_id'], outputSchema: productResult }),
  organizationTool({ name: 'batch_create_products', description: "Create several products in the selected site’s catalog when the user supplies a new catalog batch. Validates every entry before writing; any invalid entry rejects the complete request. Publication and location offerings are assigned separately.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { products: { type: 'array', minItems: 1, maxItems: PRODUCT_LIMITS.batchCreate, items: { type: 'object', properties: productWrite, required: ['name'], additionalProperties: false } } }, required: ['products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  organizationTool({ name: 'reconcile_products', description: "Create or update a supplied catalog batch when the user wants to synchronize products. A supplied product_id identifies the product to update or create; an entry without product_id creates a new product, so retrying it can create duplicates. Omitted products stay unchanged unless deactivate_missing is true, which disables their sale without deleting them.", domain: 'products', minimumRole: 'admin', confirmRequired: true, inputSchema: { products: { type: 'array', maxItems: PRODUCT_LIMITS.reconcile, items: { type: 'object', properties: { product_id: { type: 'string', minLength: 1 }, ...productWrite }, required: ['name'], additionalProperties: false } }, deactivate_missing: { type: 'boolean' } }, required: ['products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),

  organizationTool({ name: 'list_collections', description: "List the selected site’s product collections when the user wants to find menu sections or other product groups. Returns their public display order. Supply location_id to narrow the list to one location.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { location_id: { type: ['string', 'null'] } }, required: [], outputSchema: { type: 'object', properties: { collections: { type: 'array', items: collectionObject } }, required: ['collections'] } }),
  organizationTool({ name: 'create_collection', description: 'Create an empty collection. Products are added to it afterwards with set_collection_products.', domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { name: { type: 'string' }, description: { type: ['string', 'null'] }, location_id: { type: ['string', 'null'], description: 'Narrow this collection to one location, or omit for site-wide.' }, sort_order: { type: 'integer' } }, required: ['name'], outputSchema: { type: 'object', properties: { collection: collectionObject }, required: ['collection'] } }),
  organizationTool({ name: 'update_collection', description: 'Rename a collection or change its description or position.', domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { collection_id: { type: 'string' }, name: { type: 'string' }, description: { type: ['string', 'null'] }, sort_order: { type: 'integer' } }, required: ['collection_id'], outputSchema: { type: 'object', properties: { collection: collectionObject }, required: ['collection'] } }),
  organizationTool({ name: 'delete_collection', description: 'Delete a collection. The products in it are untouched.', domain: 'products', minimumRole: 'admin', confirmRequired: true, inputSchema: { collection_id: { type: 'string' } }, required: ['collection_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  organizationTool({ name: 'set_collection_products', description: "Replace a product collection’s membership and display order when the user wants to change which items it contains. Supply every product ID to retain, in the intended order. Omitted products are removed from this collection but remain in the catalog.", domain: 'products', minimumRole: 'admin', confirmRequired: true, inputSchema: { collection_id: { type: 'string' }, product_ids: { type: 'array', items: { type: 'string' }, maxItems: PRODUCT_LIMITS.collectionProducts } }, required: ['collection_id', 'product_ids'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject } }, required: ['products'] } }),
  organizationTool({ name: 'reorder_collections', description: 'Change the order of whole collections. Send every collection id in the scope exactly once, in the intended order; a partial order is rejected.', domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { collection_ids: { type: 'array', items: { type: 'string' }, minItems: 1 }, location_id: { type: ['string', 'null'] } }, required: ['collection_ids'], outputSchema: { type: 'object', properties: { collections: { type: 'array', items: collectionObject } }, required: ['collections'] } }),

  organizationTool({ name: 'list_metafield_definitions', description: "List the selected site’s product attribute definitions before reading or setting typed attributes such as inclusions, preparation instructions or pricing notes. Returns each attribute’s namespace, key, type and constraints.", domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: {}, required: [], outputSchema: { type: 'object', properties: { definitions: { type: 'array', items: metafieldDefinitionObject } }, required: ['definitions'] } }),
  organizationTool({ name: 'create_metafield_definition', description: 'Define a product attribute: its name, type, constraints and whether it may be translated. Values are set on products through metafields.', domain: 'products', minimumRole: 'admin', confirmRequired: false, inputSchema: { namespace: { type: 'string' }, key: { type: 'string' }, name: { type: 'string' }, description: { type: ['string', 'null'] }, value_type: { type: 'string', enum: [...METAFIELD_VALUE_TYPES] }, validations: { type: 'object' }, localizable: { type: 'boolean' } }, required: ['namespace', 'key', 'name', 'value_type'], outputSchema: { type: 'object', properties: { definition: metafieldDefinitionObject }, required: ['definition'] } }),
  organizationTool({ name: 'delete_metafield_definition', description: "Permanently delete a product attribute definition when the user wants to remove that attribute from the site. Deletes every product value stored under the definition.", domain: 'products', minimumRole: 'admin', confirmRequired: true, inputSchema: { definition_id: { type: 'string' } }, required: ['definition_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
]
