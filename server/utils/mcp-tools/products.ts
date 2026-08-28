import type { McpToolDefinition } from './shared'
import { pageInfoObject, paginationInputSchema, resolvedMediaAssetObject, siteTool } from './shared'

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

const productObject = {
  type: 'object',
  properties: {
    id: { type: 'string' }, location_id: { type: 'string' }, category: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' },
    description: { type: 'string' }, price_amount: { type: 'string' }, compare_at_price_amount: { type: ['string', 'null'] },
    sale_starts_at: { type: ['string', 'null'] }, sale_ends_at: { type: ['string', 'null'] }, order_url: { type: ['string', 'null'] },
    is_visible: { type: 'boolean' }, available: { type: 'boolean' }, featured: { type: 'boolean' }, featured_sort_order: { type: 'number' }, sort_order: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } }, details: { type: 'array', items: productDetailObject },
    image: { ...resolvedMediaAssetObject, type: ['object', 'null'] }, gallery: { type: 'array', items: resolvedMediaAssetObject },
    seo_title: { type: ['string', 'null'] }, seo_description: { type: ['string', 'null'] }, canonical_url: { type: ['string', 'null'] }, robots: { type: ['string', 'null'] },
    source: { type: 'string', enum: ['manual', 'template', 'ai', 'import', 'copy'] },
    created_at: { type: 'string' }, updated_at: { type: 'string' }, created_by: { type: 'string' }, updated_by: { type: 'string' },
  },
  required: ['id', 'location_id', 'category', 'name', 'slug', 'description', 'price_amount', 'is_visible', 'available', 'featured', 'featured_sort_order', 'sort_order', 'tags', 'details', 'image', 'gallery', 'source', 'created_at', 'updated_at', 'created_by', 'updated_by'],
} as const

const productWrite = {
  category: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, price_amount: { type: ['string', 'number'] },
  compare_at_price_amount: { type: ['string', 'number', 'null'] }, sale_starts_at: { type: ['string', 'null'] }, sale_ends_at: { type: ['string', 'null'] },
  order_url: { type: ['string', 'null'] }, is_visible: { type: 'boolean' }, available: { type: 'boolean' }, featured: { type: 'boolean' },
  featured_sort_order: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, details: { type: 'array', items: productDetailObject },
  seo_title: { type: ['string', 'null'] }, seo_description: { type: ['string', 'null'] }, canonical_url: { type: ['string', 'null'] }, robots: { type: ['string', 'null'] },
} as const

const productResult = { type: 'object', properties: { product: productObject }, required: ['product'] } as const

export const PRODUCTS_TOOLS: McpToolDefinition[] = [
  siteTool({ name: 'list_location_products', description: 'List Products at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, ...paginationInputSchema }, required: ['location_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject }, page_info: pageInfoObject }, required: ['products', 'page_info'] } }),
  siteTool({ name: 'get_product', description: 'Get a Product by ID.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'create_product', description: 'Create a Product at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, ...productWrite }, required: ['location_id', 'category', 'name', 'price_amount'], outputSchema: productResult }),
  siteTool({ name: 'update_product', description: 'Update a Product after resolving its stored owning location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { product_id: { type: 'string' }, ...productWrite }, required: ['product_id'], outputSchema: productResult }),
  siteTool({ name: 'delete_product', description: 'Delete a Product after resolving its stored owning location.', domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { product_id: { type: 'string' } }, required: ['product_id'], outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' } }, required: ['deleted'] } }),
  siteTool({ name: 'reorder_products', description: 'Atomically set dense Product order for one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, products: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, sort_order: { type: 'number' } }, required: ['id', 'sort_order'], additionalProperties: false } } }, required: ['location_id', 'products'], outputSchema: { type: 'object', properties: { reordered: { type: 'boolean' } }, required: ['reordered'] } }),
  siteTool({ name: 'rename_product_category', description: 'Atomically rename a Product category at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, old_category: { type: 'string' }, new_category: { type: 'string' } }, required: ['location_id', 'old_category', 'new_category'], outputSchema: { type: 'object', properties: { updated: { type: 'number' } }, required: ['updated'] } }),
  siteTool({ name: 'delete_product_category', description: 'Delete a Product category and its Products at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { location_id: { type: 'string' }, category: { type: 'string' } }, required: ['location_id', 'category'], outputSchema: { type: 'object', properties: { deleted: { type: 'number' } }, required: ['deleted'] } }),
  siteTool({ name: 'batch_create_products', description: 'Validate every row, then create all Products atomically at one explicit location. Any invalid row rolls back the complete request.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, products: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: productWrite, required: ['category', 'name', 'price_amount'], additionalProperties: false } } }, required: ['location_id', 'products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  siteTool({ name: 'sync_products', description: 'Apply the complete intended mixed create/update Product mutation atomically at one explicit location. Read every list_location_products page first. Any invalid row rolls back the complete request.', domain: 'products', minimumRole: 'editor', confirmRequired: false, strict: true, inputSchema: { location_id: { type: 'string' }, products: { type: 'array', maxItems: 100, items: { type: 'object', properties: { product_id: { type: 'string' }, ...productWrite }, required: ['category', 'name', 'price_amount'], additionalProperties: false } }, set_missing_unavailable: { type: 'boolean', description: 'When true, mark stored Products omitted from this complete request unavailable. At most 100 intended rows may be supplied.' } }, required: ['location_id', 'products'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject } }, required: ['products'] } }),
  siteTool({ name: 'import_products_from_media', description: 'Extract and atomically create validated Products from one canonical media asset at one explicit location.', domain: 'products', minimumRole: 'editor', confirmRequired: true, strict: true, inputSchema: { location_id: { type: 'string' }, asset_id: { type: 'string' } }, required: ['location_id', 'asset_id'], outputSchema: { type: 'object', properties: { products: { type: 'array', items: productObject }, rejected: { type: 'array', items: { type: 'object' } } }, required: ['products', 'rejected'] } }),
]
