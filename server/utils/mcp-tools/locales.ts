import { CONTENT_DOCUMENT_KINDS, LOCALIZED_RESOURCE_TYPES } from '~/shared/content-registries'
import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

const localizedValuesSchema = {
  type: 'object',
  description: 'Localized values follow the canonical owner fields. content_document uses title, summary, slug, SEO fields and typed metadata; content_blocks edits its representation. Other allowed fields depend on resource_type. For collection, use { name }. Product values never include a collection; collection names are localized on the collection record.',
  additionalProperties: true,
} as const

const localizationIdentity = { id: { type: 'string' }, organization_id: { type: 'string' }, site_id: { type: 'string' },
  locale: { type: 'string' }, created_at: { type: 'string' }, updated_at: { type: 'string' } } as const
const localizationObject = { oneOf: [
  { type: 'object', properties: { ...localizationIdentity, resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES] },
      resource_id: { type: 'string' }, values: localizedValuesSchema, route_path: { type: ['string','null'] },
      created_by_user_id: { type: 'string' }, updated_by_user_id: { type: 'string' } },
    required: [...Object.keys(localizationIdentity), 'resource_type','resource_id','values','route_path','created_by_user_id','updated_by_user_id'], additionalProperties: false },
  { type: 'object', properties: { ...localizationIdentity, kind: { type: 'string', enum: CONTENT_DOCUMENT_KINDS },
      row_role: { const: 'representation' }, root_id: { type: 'string' }, title: { type: ['string','null'] }, summary: { type: ['string','null'] },
      slug: { type: ['string','null'] }, path: { type: ['string','null'] }, seo_title: { type: ['string','null'] },
      seo_description: { type: ['string','null'] }, seo_keywords: { type: ['string','null'] }, metadata: { type: 'object', additionalProperties: true },
      content_blocks: { type: 'array', items: { type: 'object', additionalProperties: true } } },
    required: [...Object.keys(localizationIdentity), 'kind','row_role','root_id','title','summary','slug','path','seo_title','seo_description','seo_keywords','metadata','content_blocks'], additionalProperties: false },
] } as const

export const LOCALES_TOOLS: McpToolDefinition[] = [
  siteTool({
    name: 'list_site_locales',
    description: 'List the immutable English source locale and exact authored secondary locales for this site. Billing is managed only in the dashboard.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {},
    outputSchema: {
      type: 'object',
      properties: {
        locales: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
      required: ['locales'],
      additionalProperties: false,
    },
  }),
  siteTool({
    name: 'get_resource_localization',
    description: 'Read one exact resource or content document representation. Returns not found when that exact representation does not exist; never returns English fallback content.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES, 'content_document'] },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
    },
    required: ['resource_type', 'resource_id', 'locale'],
    outputSchema: { type: 'object', properties: { localization: localizationObject }, required: ['localization'], additionalProperties: false },
  }),
  siteTool({
    name: 'put_resource_localization',
    description: 'Fully replace one exact resource or content document representation. Resource values replace the exact localization; document fields and blocks update the exact representation with expected_updated_at.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES, 'content_document'] },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
      values: localizedValuesSchema,
      route_path: { type: ['string', 'null'] },
      content_blocks: { type: ['array', 'null'], items: { type: 'object', additionalProperties: true } },
      expected_updated_at: { type: ['string', 'null'] },
    },
    required: ['resource_type', 'resource_id', 'locale', 'values'],
    outputSchema: { type: 'object', properties: { localization: localizationObject }, required: ['localization'], additionalProperties: false },
  }),
  siteTool({
    name: 'delete_resource_localization',
    description: 'Permanently delete one localized resource representation and its owned document and redirect state. This does not change billing.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES, 'content_document'] },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
    },
    required: ['resource_type', 'resource_id', 'locale'],
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES, 'content_document'] }, resource_id: { type: 'string' }, locale: { type: 'string' } }, required: ['deleted', 'resource_type', 'resource_id', 'locale'], additionalProperties: false },
  }),
  siteTool({
    name: 'get_product_catalog_localization',
    description: 'List canonical Product IDs, source Product fields, and existing Product localizations for one published secondary locale. Localize collection names separately with get_resource_localization and put_resource_localization using resource_type collection, resource_id collection_id, and values { name }.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { locale: { type: 'string' } },
    required: ['locale'],
    outputSchema: { type: 'object', properties: { locale: { type: 'string' }, products: { type: 'array', items: { type: 'object', additionalProperties: true } } }, required: ['locale', 'products'], additionalProperties: false },
  }),
  siteTool({
    name: 'replace_product_localizations',
    description: 'Atomically replace 1–250 exact Product localizations for one published locale. Omitted Products remain untouched; any invalid item rejects the whole submitted batch.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      locale: { type: 'string' },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 250,
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'string' },
            values: localizedValuesSchema,
            route_path: { type: 'string' },
          },
          required: ['product_id', 'values', 'route_path'],
          additionalProperties: false,
        },
      },
    },
    required: ['locale', 'items'],
    outputSchema: { type: 'object', properties: { locale: { type: 'string' }, updated_product_ids: { type: 'array', items: { type: 'string' } } }, required: ['locale', 'updated_product_ids'], additionalProperties: false },
  }),
]
