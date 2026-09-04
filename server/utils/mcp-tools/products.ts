import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, resolvedMediaAssetObject, siteTool } from './shared'
import { PRODUCT_DETAILS_INPUT_SCHEMA, PRODUCT_LIMITS } from '~/server/utils/product-validation'
import { SUPPORTED_CURRENCIES } from '~/shared/currencies'

const priceObject = {
  type: ['object', 'null'],
  properties: {
    id: { type: 'string' }, amount_minor: { type: 'integer' }, currency: { type: 'string' },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'] }, valid_from: { type: 'string' },
    valid_until: { type: ['string', 'null'] }, provenance: { type: 'string' },
  },
  required: ['id', 'amount_minor', 'currency', 'unit', 'tax_behavior', 'compare_at_amount_minor', 'valid_from', 'valid_until', 'provenance'],
} as const

const priceWrite = {
  type: ['object', 'null'],
  description: 'Fixed numeric price, or null when this Product has no fixed amount. Zero means free and must not be used as a placeholder. Put explicit customer-facing wording in a details entry with key "price-note". Currency defaults to the site currency, unit defaults to item, and tax_behavior defaults to unspecified.',
  properties: {
    amount_minor: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES] },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, valid_from: { type: 'string', format: 'date-time' }, valid_until: { type: ['string', 'null'], format: 'date-time' },
  },
  required: ['amount_minor'],
  additionalProperties: false,
} as const

const productCategoryObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, location_id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' },
    sort_order: { type: 'number' },
    created_at: { type: 'string' }, updated_at: { type: 'string' }, created_by: { type: 'string' }, updated_by: { type: 'string' },
  },
  required: ['id', 'location_id', 'name', 'slug', 'sort_order', 'created_at', 'updated_at', 'created_by', 'updated_by'],
} as const

/** The category as carried on a Product read. Writes reference it by category_id. */
const productCategoryRefObject = {
  type: 'object',
  properties: { id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' }, sort_order: { type: 'number' } },
  required: ['id', 'name', 'slug', 'sort_order'],
} as const

const productObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, location_id: { type: 'string' }, category_id: { type: 'string' }, category: productCategoryRefObject, name: { type: 'string' }, slug: { type: 'string' },
    description: { type: 'string' }, price: priceObject, order_url: { type: ['string', 'null'] },
    is_visible: { type: 'boolean' }, available: { type: 'boolean' }, featured: { type: 'boolean' }, featured_sort_order: { type: 'number' }, sort_order: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } }, details: PRODUCT_DETAILS_INPUT_SCHEMA,
    image: { ...resolvedMediaAssetObject, type: ['object', 'null'] }, gallery: { type: 'array', items: resolvedMediaAssetObject },
    seo_title: { type: ['string', 'null'] }, seo_description: { type: ['string', 'null'] }, canonical_url: { type: ['string', 'null'] }, robots: { type: ['string', 'null'] },
    source: { type: 'string', enum: ['manual', 'template', 'ai', 'import', 'copy'] },
    created_at: { type: 'string' }, updated_at: { type: 'string' }, created_by: { type: 'string' }, updated_by: { type: 'string' },
  },
  required: ['id', 'location_id', 'category_id', 'category', 'name', 'slug', 'description', 'price', 'is_visible', 'available', 'featured', 'featured_sort_order', 'sort_order', 'tags', 'details', 'image', 'gallery', 'source', 'created_at', 'updated_at', 'created_by', 'updated_by'],
} as const

const productListPriceObject = {
  type: ['object', 'null'],
  properties: {
    amount_minor: { type: 'integer' },
    currency: { type: 'string' },
    unit: { type: 'string', enum: ['item', 'person', 'table'] },
    tax_behavior: { type: 'string', enum: ['unspecified', 'inclusive', 'exclusive'] },
    compare_at_amount_minor: { type: ['integer', 'null'] },
  },
  required: ['amount_minor', 'currency', 'unit', 'tax_behavior', 'compare_at_amount_minor'],
} as const

const productListItemObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    location_id: { type: 'string' },
    category_id: { type: 'string' },
    category: productCategoryRefObject,
    name: { type: 'string' },
    description: { type: 'string' },
    price: productListPriceObject,
    is_visible: { type: 'boolean' },
    available: { type: 'boolean' },
    sort_order: { type: 'integer' },
  },
  required: ['id', 'location_id', 'category_id', 'category', 'name', 'description', 'price', 'is_visible', 'available', 'sort_order'],
} as const

// Category membership is set on create and changed only by move_products, so
// the update surface deliberately has no category_id: accepting one that
// updateProduct ignores would report a move that never happened.
const productWrite = {
  category_id: { type: 'string', description: 'ID of a category at the selected location. Read list_product_categories first; use create_product_category when the intended section does not exist. Never send a category name in place of this ID.' }, name: { type: 'string' }, description: { type: 'string' }, price: priceWrite,
  order_url: { type: ['string', 'null'] }, is_visible: { type: 'boolean' }, available: { type: 'boolean' }, featured: { type: 'boolean' },
  featured_sort_order: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, details: PRODUCT_DETAILS_INPUT_SCHEMA,
  seo_title: { type: ['string', 'null'] }, seo_description: { type: ['string', 'null'] }, canonical_url: { type: ['string', 'null'] }, robots: { type: ['string', 'null'] },
} as const

const { category_id: _createOnlyCategoryId, ...productUpdate } = productWrite

const productResult = { type: 'object', properties: { product: productObject }, required: ['product'] } as const

export const PRODUCTS_TOOLS: McpToolDefinition[] = [
  siteTool({ name: 'list_location_products', description: 'Use this when you need the compact ordered Product list for one explicit location. Returns identity, category, name, description, current price, visibility, availability, and sort order. Call get_product for media, SEO, audit fields, or other full details.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, ...paginationInputSchema }, required: ['location_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productListItemObject }, page_info: pageInfoObject }, required: ['products', 'page_info'] } }),
  siteTool({ name: 'get_product', description: 'Get a Product by ID.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'create_product', description: 'Create a Product at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, ...productWrite }, required: ['location_id', 'category_id', 'name', 'price'], outputSchema: productResult }),
  siteTool({ name: 'update_product', description: 'Update a Product after resolving its stored owning location. Omit price to leave pricing unchanged. Use price: null to close the active fixed Price without creating a replacement. Use move_products to change which category a Product belongs to.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { product_id: { type: 'string' }, ...productUpdate }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'delete_product', description: 'Delete a Product after resolving its stored owning location.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  siteTool({ name: 'move_products', description: 'Use this when the user wants Products to belong to a different category or menu section. The Products are appended to the end of the target category in the order given. This changes category membership only; use reorder_products to change the order inside a category.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, product_ids: { type: 'array', items: { type: 'string' }, minItems: 1 }, category_id: { type: 'string' } }, required: ['location_id', 'product_ids', 'category_id'], outputSchema: { type: 'object', properties: { moved: { type: 'boolean' } }, required: ['moved'] } }),
  siteTool({ name: 'reorder_products', description: 'Use this when the user wants to change the order of Products inside one category. Read every list_location_products page and select Products with the intended category_id. Send every Product ID in that category exactly once, in the intended order; a partial order is rejected.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, category_id: { type: 'string' }, product_ids: { type: 'array', items: { type: 'string' }, minItems: 1 } }, required: ['location_id', 'category_id', 'product_ids'], outputSchema: { type: 'object', properties: { reordered: { type: 'boolean' } }, required: ['reordered'] } }),
  siteTool({ name: 'list_product_categories', description: 'List the Product categories or menu sections at one explicit location, in the order customers see them.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' } }, required: ['location_id'], outputSchema: { type: 'object', properties: { categories: { type: 'array', items: productCategoryObject } }, required: ['categories'] } }),
  siteTool({ name: 'create_product_category', description: 'Create an empty Product category or menu section at one explicit location. Products are added to it afterwards.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, name: { type: 'string' } }, required: ['location_id', 'name'], outputSchema: { type: 'object', properties: { category: productCategoryObject }, required: ['category'] } }),
  siteTool({ name: 'reorder_product_categories', description: 'Use this when the user wants to change the order of whole categories or menu sections, such as putting desserts last. Send every category ID at the location exactly once, in the intended order. Read list_product_categories first; a partial order is rejected.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, category_ids: { type: 'array', items: { type: 'string' }, minItems: 1 } }, required: ['location_id', 'category_ids'], outputSchema: { type: 'object', properties: { categories: { type: 'array', items: productCategoryObject } }, required: ['categories'] } }),
  siteTool({ name: 'rename_product_category', description: 'Rename a Product category or menu section. The name lives on the category itself, so this is one edit and every Product in it follows.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, category_id: { type: 'string' }, name: { type: 'string' } }, required: ['location_id', 'category_id', 'name'], outputSchema: { type: 'object', properties: { category: productCategoryObject }, required: ['category'] } }),
  siteTool({ name: 'delete_product_category', description: 'Delete a Product category and every Product in it at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { location_id: { type: 'string' }, category_id: { type: 'string' } }, required: ['location_id', 'category_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'number' } }, required: ['deleted'] } }),
  siteTool({ name: 'batch_create_products', description: 'Validate every row, then create all Products atomically at one explicit location. Any invalid row rolls back the complete request.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, products: { type: 'array', minItems: 1, maxItems: PRODUCT_LIMITS.batchCreate, items: { type: 'object', properties: productWrite, required: ['category_id', 'name', 'price'], additionalProperties: false } } }, required: ['location_id', 'products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  siteTool({ name: 'sync_products', description: 'Apply the complete intended mixed create/update Product mutation atomically at one explicit location. Read every list_location_products page first. Any invalid row rolls back the complete request. Every row must include price; use null when the intended state has no active fixed Price.', domain: 'products', minimumRole: 'editor', confirmRequired: false, inputSchema: { location_id: { type: 'string' }, products: { type: 'array', maxItems: PRODUCT_LIMITS.sync, items: { type: 'object', properties: { product_id: { type: 'string', minLength: 1 }, ...productWrite }, required: ['category_id', 'name', 'price'], additionalProperties: false } }, set_missing_unavailable: { type: 'boolean', description: `When true, mark stored Products omitted from this complete request unavailable. At most ${PRODUCT_LIMITS.sync} intended rows may be supplied.` } }, required: ['location_id', 'products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  siteTool({ name: 'import_products_from_media', description: 'Extract one strict structured batch and atomically create validated Products from one canonical media asset at one explicit location. Empty or partially invalid extraction is an error.', domain: 'products', minimumRole: 'editor', confirmRequired: true, inputSchema: { location_id: { type: 'string' }, asset_id: { type: 'string' } }, required: ['location_id', 'asset_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject }, creditsRemaining: { type: 'number' } }, required: ['products', 'creditsRemaining'] } }),
]
