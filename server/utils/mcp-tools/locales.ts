import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

const localizedValuesSchema = {
  type: 'object',
  description: 'Complete exact localized scalar representation. Allowed and required fields depend on resource_type.',
  additionalProperties: true,
} as const

const localizationObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    resource_type: { type: 'string' },
    resource_id: { type: 'string' },
    locale: { type: 'string' },
    values: localizedValuesSchema,
    route_path: { type: ['string', 'null'] },
    document_id: { type: ['string', 'null'] },
  },
  required: ['id', 'resource_type', 'resource_id', 'locale', 'values', 'route_path', 'document_id'],
  additionalProperties: false,
} as const

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
    description: 'Read one exact licensed resource localization. Returns not found when that exact representation does not exist; never returns English fallback content.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      resource_type: { type: 'string' },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
    },
    required: ['resource_type', 'resource_id', 'locale'],
    outputSchema: { type: 'object', properties: { localization: localizationObject }, required: ['localization'], additionalProperties: false },
  }),
  siteTool({
    name: 'put_resource_localization',
    description: 'Fully replace one exact licensed resource localization. The payload is validated against the canonical typed field registry and is never merged with English or stale localized values.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      resource_type: { type: 'string' },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
      values: localizedValuesSchema,
      route_path: { type: ['string', 'null'] },
    },
    required: ['resource_type', 'resource_id', 'locale', 'values'],
    outputSchema: { type: 'object', properties: { localization: localizationObject }, required: ['localization'], additionalProperties: false },
  }),
  siteTool({
    name: 'delete_resource_localization',
    description: 'Permanently delete one exact localized resource representation and its owned document and redirect state. This does not change billing.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: true,
    inputSchema: {
      resource_type: { type: 'string' },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
    },
    required: ['resource_type', 'resource_id', 'locale'],
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, resource_type: { type: 'string' }, resource_id: { type: 'string' }, locale: { type: 'string' } }, required: ['deleted', 'resource_type', 'resource_id', 'locale'], additionalProperties: false },
  }),
  siteTool({
    name: 'get_product_catalog_localization',
    description: 'List canonical Product IDs and their exact existing localization for one licensed secondary locale so a complete batch can be prepared.',
    domain: 'locales',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: { locale: { type: 'string' } },
    required: ['locale'],
    outputSchema: { type: 'object', properties: { locale: { type: 'string' }, products: { type: 'array', items: { type: 'object', additionalProperties: true } } }, required: ['locale', 'products'], additionalProperties: false },
  }),
  siteTool({
    name: 'sync_product_catalog_localization',
    description: 'Atomically replace 1–250 exact Product localizations for one licensed locale. Omitted Products remain untouched; any invalid item rejects the whole submitted batch.',
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
