import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, resolvedMediaAssetObject, siteTool } from './shared'
import { PRODUCT_LIMITS } from '~/server/utils/product-validation'

const productDetailObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    values: { type: 'array', items: { type: 'string' } },
  },
  required: ['key', 'label', 'values'],
} as const

const priceObject = {
  type: ['object', 'null'],
  properties: {
    id: { type: 'string' }, amount_minor: { type: 'integer' }, currency: { type: 'string' },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'] }, valid_from: { type: 'string' },
    valid_until: { type: ['string', 'null'] }, provenance: { type: 'string' },
    provider_mappings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, resource_type: { type: 'string', enum: ['product', 'price', 'modifier_group', 'modifier_option'] }, resource_id: { type: 'string' }, provider: { type: 'string' }, provider_account_reference: { type: ['string', 'null'] }, external_id: { type: 'string' } }, required: ['id', 'resource_type', 'resource_id', 'provider', 'provider_account_reference', 'external_id'], additionalProperties: false } },
  },
  required: ['id', 'amount_minor', 'currency', 'unit', 'tax_behavior', 'compare_at_amount_minor', 'valid_from', 'valid_until', 'provenance', 'provider_mappings'],
} as const

const inventoryObject = {
  type: ['object', 'null'],
  properties: {
    id: { type: 'string' }, product_id: { type: 'string' }, authority_id: { type: 'string' },
    quantity_on_hand: { type: 'integer' }, quantity_reserved: { type: 'integer' }, available_quantity: { type: 'integer' },
    revision: { type: 'integer' }, source_version: { type: ['integer', 'null'] }, valid_until: { type: ['string', 'null'] },
    state: { type: 'string', enum: ['current', 'unresolved'] }, status: { type: 'string', enum: ['available', 'unavailable'] },
    unavailable_reason: { type: ['string', 'null'], enum: ['missing_authority', 'missing_snapshot', 'stale', 'unresolved', 'out_of_stock', null] },
    updated_at: { type: 'string' },
  },
  required: ['id', 'product_id', 'authority_id', 'quantity_on_hand', 'quantity_reserved', 'available_quantity', 'revision', 'source_version', 'valid_until', 'state', 'status', 'unavailable_reason', 'updated_at'],
  additionalProperties: false,
} as const

const inventoryAuthorityObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, organization_id: { type: 'string' }, site_id: { type: 'string' }, location_id: { type: 'string' },
    authority_type: { type: 'string', enum: ['krabiclaw', 'external'] }, provider: { type: ['string', 'null'] },
    oauth_client_id: { type: ['string', 'null'] }, provider_account_reference: { type: ['string', 'null'] },
    external_location_reference: { type: ['string', 'null'] }, created_by: { type: 'string' }, updated_by: { type: 'string' },
    created_at: { type: 'string' }, updated_at: { type: 'string' },
  },
  required: ['id', 'organization_id', 'site_id', 'location_id', 'authority_type', 'provider', 'oauth_client_id', 'provider_account_reference', 'external_location_reference', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  additionalProperties: false,
} as const

const inventoryMovementObject = {
  type: 'object',
  properties: {
    ...inventoryObject.properties,
    movement_id: { type: 'string' }, movement_type: { type: 'string', enum: ['restock', 'reserve', 'release', 'consume', 'waste', 'manual_adjustment', 'external_sync'] },
    quantity_on_hand_delta: { type: 'integer' }, quantity_reserved_delta: { type: 'integer' },
    actor_type: { type: 'string', enum: ['user', 'integration', 'system'] }, actor_id: { type: 'string' },
    reference_type: { type: ['string', 'null'] }, reference_id: { type: ['string', 'null'] },
    idempotency_key: { type: 'string' }, created_at: { type: 'string' },
  },
  required: [...inventoryObject.required, 'movement_id', 'movement_type', 'quantity_on_hand_delta', 'quantity_reserved_delta', 'actor_type', 'actor_id', 'reference_type', 'reference_id', 'idempotency_key', 'created_at'],
  additionalProperties: false,
} as const

const providerMappingObject = priceObject.properties.provider_mappings.items

const modifierOptionObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, modifier_group_id: { type: 'string' }, name: { type: 'string' }, price_delta_minor: { type: 'integer' },
    sort_order: { type: 'integer' }, is_active: { type: 'boolean' }, provider_mappings: { type: 'array', items: providerMappingObject },
  },
  required: ['id', 'modifier_group_id', 'name', 'price_delta_minor', 'sort_order', 'is_active', 'provider_mappings'],
  additionalProperties: false,
} as const

const modifierGroupObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, minimum_selections: { type: 'integer' }, maximum_selections: { type: 'integer' },
    sort_order: { type: 'integer' }, is_active: { type: 'boolean' }, options: { type: 'array', items: modifierOptionObject },
    provider_mappings: { type: 'array', items: providerMappingObject },
  },
  required: ['id', 'name', 'minimum_selections', 'maximum_selections', 'sort_order', 'is_active', 'options', 'provider_mappings'],
  additionalProperties: false,
} as const

const modifierGroupWriteObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, minimum_selections: { type: 'integer', minimum: 0 }, maximum_selections: { type: 'integer', minimum: 1 }, is_active: { type: 'boolean' },
    options: { type: 'array', maxItems: 50, items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, price_delta_minor: { type: 'integer', minimum: 0 }, is_active: { type: 'boolean' } }, required: ['name'], additionalProperties: false } },
  },
  required: ['name', 'options'],
  additionalProperties: false,
} as const

const priceWrite = {
  type: ['object', 'null'],
  properties: {
    amount_minor: { type: 'integer', minimum: 0 }, currency: { type: 'string' },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'] }, valid_from: { type: 'string' }, valid_until: { type: ['string', 'null'] }, provenance: { type: 'string' },
  },
  required: ['amount_minor'],
  additionalProperties: false,
} as const

const productObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' },
    description: { type: 'string' }, price: priceObject, order_url: { type: ['string', 'null'] },
    is_visible: { type: 'boolean' }, available: { type: 'boolean' }, featured: { type: 'boolean' }, featured_sort_order: { type: 'number' }, sort_order: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } }, details: { type: 'array', items: productDetailObject },
    image: { ...resolvedMediaAssetObject, type: ['object', 'null'] }, gallery: { type: 'array', items: resolvedMediaAssetObject },
    seo_title: { type: ['string', 'null'] }, seo_description: { type: ['string', 'null'] }, canonical_url: { type: ['string', 'null'] }, robots: { type: ['string', 'null'] },
    source: { type: 'string', enum: ['manual', 'template', 'ai', 'import', 'copy'] },
    menu_placement: { type: ['object', 'null'], properties: { id: { type: 'string' }, location_id: { type: 'string' }, product_id: { type: 'string' }, section: { type: 'string' }, sort_order: { type: 'integer' }, is_published: { type: 'boolean' }, featured: { type: 'boolean' }, featured_sort_order: { type: 'integer' } }, required: ['id', 'location_id', 'product_id', 'section', 'sort_order', 'is_published', 'featured', 'featured_sort_order'] },
    channel_availability: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, location_id: { type: 'string' }, product_id: { type: 'string' }, channel: { type: 'string', enum: ['seo', 'ordering'] }, is_available: { type: 'boolean' } }, required: ['id', 'location_id', 'product_id', 'channel', 'is_available'], additionalProperties: false } },
    modifier_groups: { type: 'array', items: modifierGroupObject },
    provider_mappings: { type: 'array', items: providerMappingObject },
    inventory: inventoryObject,
    created_at: { type: 'string' }, updated_at: { type: 'string' }, created_by: { type: 'string' }, updated_by: { type: 'string' },
  },
  required: ['id', 'location_id', 'category', 'name', 'slug', 'description', 'price', 'is_visible', 'available', 'featured', 'featured_sort_order', 'sort_order', 'tags', 'details', 'image', 'gallery', 'source', 'created_at', 'updated_at', 'created_by', 'updated_by', 'menu_placement', 'channel_availability', 'modifier_groups', 'provider_mappings', 'inventory'],
} as const

const productListPriceObject = {
  type: ['object', 'null'],
  properties: {
    id: { type: 'string' }, amount_minor: { type: 'integer' },
    currency: { type: 'string' },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'] },
  },
  required: ['id', 'amount_minor', 'currency', 'unit', 'tax_behavior', 'compare_at_amount_minor'],
} as const

const productListItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    location_id: { type: 'string' },
    category: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    price: productListPriceObject,
    is_visible: { type: 'boolean' },
    available: { type: 'boolean' },
    sort_order: { type: 'integer' },
    channel_availability: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, location_id: { type: 'string' }, product_id: { type: 'string' }, channel: { type: 'string', enum: ['seo', 'ordering'] }, is_available: { type: 'boolean' } }, required: ['id', 'location_id', 'product_id', 'channel', 'is_available'], additionalProperties: false } },
    inventory: inventoryObject,
  },
  required: ['id', 'location_id', 'category', 'name', 'description', 'price', 'is_visible', 'available', 'sort_order', 'channel_availability', 'inventory'],
} as const

const productBulkWrite = {
  category: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, price: priceWrite,
  order_url: { type: ['string', 'null'] }, is_visible: { type: 'boolean' }, available: { type: 'boolean' }, featured: { type: 'boolean' },
  featured_sort_order: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, details: { type: 'array', items: productDetailObject },
  seo_title: { type: ['string', 'null'] }, seo_description: { type: ['string', 'null'] }, canonical_url: { type: ['string', 'null'] }, robots: { type: ['string', 'null'] },
  channel_availability: { type: 'object', properties: { seo: { type: 'boolean' }, ordering: { type: 'boolean' } }, additionalProperties: false },
} as const

const productWrite = {
  ...productBulkWrite,
  modifier_groups: { type: 'array', maxItems: 20, items: modifierGroupWriteObject },
} as const

const productResult = { type: 'object', properties: { product: productObject }, required: ['product'] } as const

export const PRODUCTS_TOOLS: McpToolDefinition[] = [
  siteTool({ name: 'list_location_products', description: 'Use this when you need the compact ordered Product list for one explicit location. Returns identity, category, name, description, current price, visibility, availability, and sort order. Call get_product for media, SEO, audit fields, or other full details.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, ...paginationInputSchema }, required: ['location_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject }, page_info: pageInfoObject }, required: ['products', 'page_info'] } }),
  siteTool({ name: 'get_product', description: 'Get a Product by ID.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'create_product', description: 'Create a Product at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, ...productWrite }, required: ['location_id', 'category', 'name', 'price'], outputSchema: productResult }),
  siteTool({ name: 'update_product', description: 'Update a Product after resolving its stored owning location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { product_id: { type: 'string' }, ...productWrite }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'delete_product', description: 'Delete a Product after resolving its stored owning location.', domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  siteTool({ name: 'move_products', description: 'Use this when the user wants to reorder specific Products. Move only the named Products as one ordered block before another Product, or to the end when before_product_id is null. Never send the full catalog.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, product_ids: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } }, before_product_id: { type: ['string', 'null'] } }, required: ['location_id', 'product_ids', 'before_product_id'], outputSchema: { type: 'object', properties: { moved: { type: 'boolean' } }, required: ['moved'] } }),
  siteTool({ name: 'move_product_category', description: 'Use this when the user wants to reorder an entire Product category or menu section. Move the named category before another category, or to the end when before_category is null. The server moves every Product in the category. Do not list or send Product IDs.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, category: { type: 'string' }, before_category: { type: ['string', 'null'] } }, required: ['location_id', 'category', 'before_category'], outputSchema: { type: 'object', properties: { moved: { type: 'boolean' } }, required: ['moved'] } }),
  siteTool({ name: 'rename_product_category', description: 'Atomically rename a Product category at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, old_category: { type: 'string' }, new_category: { type: 'string' } }, required: ['location_id', 'old_category', 'new_category'], outputSchema: { type: 'object', properties: { updated: { type: 'number' } }, required: ['updated'] } }),
  siteTool({ name: 'delete_product_category', description: 'Delete a Product category and its Products at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { location_id: { type: 'string' }, category: { type: 'string' } }, required: ['location_id', 'category'], outputSchema: { type: 'object', properties: { deleted: { type: 'number' } }, required: ['deleted'] } }),
  siteTool({ name: 'batch_create_products', description: 'Validate every row, then create all Products atomically at one explicit location. Any invalid row rolls back the complete request.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, products: { type: 'array', minItems: 1, maxItems: PRODUCT_LIMITS.batchCreate, items: { type: 'object', properties: productBulkWrite, required: ['category', 'name', 'price'], additionalProperties: false } } }, required: ['location_id', 'products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  siteTool({ name: 'sync_products', description: 'Apply the complete intended mixed create/update Product mutation atomically at one explicit location. Read every list_location_products page first. Any invalid row rolls back the complete request.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, products: { type: 'array', maxItems: PRODUCT_LIMITS.sync, items: { type: 'object', properties: { product_id: { type: 'string' }, ...productBulkWrite }, required: ['category', 'name', 'price'], additionalProperties: false } }, set_missing_unavailable: { type: 'boolean', description: `When true, mark stored Products omitted from this complete request unavailable. At most ${PRODUCT_LIMITS.sync} intended rows may be supplied.` } }, required: ['location_id', 'products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  siteTool({ name: 'import_products_from_media', description: 'Extract one strict structured batch and atomically create validated Products from one canonical media asset at one explicit location. Empty or partially invalid extraction is an error.', domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { location_id: { type: 'string' }, asset_id: { type: 'string' } }, required: ['location_id', 'asset_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject }, creditsRemaining: { type: 'number' } }, required: ['products', 'creditsRemaining'] } }),
  siteTool({ name: 'get_location_inventory', description: 'Read the declared inventory authority and current fail-closed Product quantities for one location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' } }, required: ['location_id'], outputSchema: { type: 'object', properties: { authority: { ...inventoryAuthorityObject, type: ['object', 'null'] }, items: { type: 'array', items: inventoryObject } }, required: ['authority', 'items'] } }),
  siteTool({ name: 'set_inventory_authority', description: 'Declare the single inventory authority for a location. An existing declaration cannot be silently replaced.', domain: 'products', minimumRole: 'admin', confirmRequired: true, strict: true, inputSchema: { location_id: { type: 'string' }, authority_type: { type: 'string', enum: ['krabiclaw', 'external'] }, provider: { type: 'string' }, oauth_client_id: { type: 'string' }, provider_account_reference: { type: 'string' }, external_location_reference: { type: 'string' } }, required: ['location_id', 'authority_type'], outputSchema: { type: 'object', properties: { authority: inventoryAuthorityObject }, required: ['authority'] } }),
  siteTool({ name: 'record_inventory_movement', description: 'Record an attributable append-only restock, waste, or signed manual adjustment for KrabiClaw-authoritative inventory.', domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { product_id: { type: 'string' }, movement_type: { type: 'string', enum: ['restock', 'waste', 'manual_adjustment'] }, quantity: { type: 'integer' }, idempotency_key: { type: 'string' }, reference_type: { type: 'string' }, reference_id: { type: 'string' } }, required: ['product_id', 'movement_type', 'quantity', 'idempotency_key'], outputSchema: { type: 'object', properties: { movement: inventoryMovementObject }, required: ['movement'] } }),
  ...(['reserve', 'release', 'consume'] as const).map(operation => siteTool({ name: `${operation}_inventory`, description: `${operation[0]!.toUpperCase()}${operation.slice(1)} a Product quantity atomically after revalidating the current authoritative snapshot.`, domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { product_id: { type: 'string' }, quantity: { type: 'integer', minimum: 1 }, idempotency_key: { type: 'string' }, reference_type: { type: 'string' }, reference_id: { type: 'string' } }, required: ['product_id', 'quantity', 'idempotency_key', 'reference_type', 'reference_id'], outputSchema: { type: 'object', properties: { movement: inventoryMovementObject }, required: ['movement'] } })),
]
