import { CONTENT_DOCUMENT_KINDS, LOCALIZED_RESOURCE_TYPES } from '~/shared/content-registries'
import type { McpToolDefinition } from './shared'
import { organizationTool } from './shared'
import type { McpExecutorContext } from './execution'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  deleteLocalization,
  getProductCatalogLocalization,
  getLocalizationForAuthoring,
  putLocalizationForAuthoring,
  replaceResourceLocalizations,
} from '~/server/utils/localization'
import { listOrganizationLocales } from '~/server/utils/organization-locales'
import { NOT_HANDLED, mutationContextPayload, requiredString } from './execution'

const localizedValuesSchema = {
  type: 'object',
  description: 'Localized values follow the canonical owner fields. content_document uses title, summary, slug, SEO fields and typed metadata; content_blocks edits its representation. Other allowed fields depend on resource_type. For collection, use { name }. Product values never include a collection; collection names are localized on the collection record.',
  additionalProperties: true,
} as const

const localizationIdentity = { id: { type: 'string' }, organization_id: { type: 'string' }, 
  locale: { type: 'string' }, created_at: { type: 'string' }, updated_at: { type: 'string' } } as const
const localizationObject = { oneOf: [
  { type: 'object', properties: { ...localizationIdentity, resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES] },
      resource_id: { type: 'string' }, values: localizedValuesSchema, route_path: { type: ['string','null'] },
      created_by_user_id: { type: 'string' }, updated_by_user_id: { type: 'string' } },
    required: [...Object.keys(localizationIdentity), 'resource_type','resource_id','values','route_path','created_by_user_id','updated_by_user_id'], additionalProperties: false },
  { type: 'object', properties: { ...localizationIdentity, kind: { type: 'string', enum: CONTENT_DOCUMENT_KINDS },
      row_role: { const: 'representation' }, root_id: { type: 'string' }, title: { type: ['string','null'] }, summary: { type: ['string','null'] },
      slug: { type: ['string','null'] }, path: { type: ['string','null'] },
      seo_keywords: { type: ['string','null'] }, metadata: { type: 'object', additionalProperties: true },
      content_blocks: { type: 'array', items: { type: 'object', additionalProperties: true } } },
    required: [...Object.keys(localizationIdentity), 'kind','row_role','root_id','title','summary','slug','path','seo_keywords','metadata','content_blocks'], additionalProperties: false },
] } as const

export const LOCALES_TOOLS: McpToolDefinition[] = [
  organizationTool({
    name: 'list_organization_locales',
    description: "Read the site’s English source language and authored secondary languages. English is fixed as the source; this tool does not create or translate content.",
    domain: 'locales',
    minimumRole: 'admin',
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
  organizationTool({
    name: 'get_resource_localization',
    description: "Read the requested resource or document in exactly the named language. A missing translation returns not found rather than source-language content.",
    domain: 'locales',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES, 'content_document'] },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
    },
    required: ['resource_type', 'resource_id', 'locale'],
    outputSchema: { type: 'object', properties: { localization: localizationObject }, required: ['localization'], additionalProperties: false },
  }),
  organizationTool({
    name: 'put_resource_localization',
    description: "Replace the requested resource’s translation in exactly the named language. Resource values replace that translation; document fields and blocks require expected_updated_at. This localization tool does not edit Q&A; authored Q&A uses its dedicated tools.",
    domain: 'locales',
    minimumRole: 'admin',
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
    outputSchema: { type: 'object', properties: { localization: localizationObject, context: { type: 'object' } }, required: ['localization'], additionalProperties: false },
  }),
  organizationTool({
    name: 'delete_resource_localization',
    description: "Permanently remove one resource translation when the user requests deletion of that language representation. Also deletes its owned document and redirects. Authored Q&A is managed with delete_qa.",
    domain: 'locales',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: {
      resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES, 'content_document'] },
      resource_id: { type: 'string' },
      locale: { type: 'string' },
    },
    required: ['resource_type', 'resource_id', 'locale'],
    outputSchema: { type: 'object', properties: { deleted: { type: 'boolean' }, resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES, 'content_document'] }, resource_id: { type: 'string' }, locale: { type: 'string' }, context: { type: 'object' } }, required: ['deleted', 'resource_type', 'resource_id', 'locale'], additionalProperties: false },
  }),
  organizationTool({
    name: 'get_product_catalog_localization',
    description: "Read source product fields and existing translations when the user wants to review or translate the catalog in a published secondary language. Collection names use the resource-localization tools separately.",
    domain: 'locales',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: { locale: { type: 'string' } },
    required: ['locale'],
    outputSchema: { type: 'object', properties: { locale: { type: 'string' }, products: { type: 'array', items: { type: 'object', additionalProperties: true } } }, required: ['locale', 'products'], additionalProperties: false },
  }),
  organizationTool({
    name: 'replace_resource_localizations',
    description: 'Atomically replace 1–250 exact localizations of one resource type for one locale. Omitted resources remain untouched; any invalid item rejects the whole submitted batch. Returns the saved representations; supplied document content replaces its complete representation and can remove blocks. This uses supplied translations, without generating them.',
    domain: 'locales',
    minimumRole: 'admin',
    confirmRequired: true,
    inputSchema: {
      resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES] },
      locale: { type: 'string' },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 250,
        items: {
          type: 'object',
          properties: {
            resource_id: { type: 'string' },
            values: localizedValuesSchema,
            route_path: { type: ['string', 'null'] },
          },
          required: ['resource_id', 'values'],
          additionalProperties: false,
        },
      },
    },
    required: ['resource_type', 'locale', 'items'],
    outputSchema: { type: 'object', properties: { locale: { type: 'string' }, resource_type: { type: 'string', enum: [...LOCALIZED_RESOURCE_TYPES] }, updated_resource_ids: { type: 'array', items: { type: 'string' } }, context: { type: 'object' } }, required: ['locale', 'resource_type', 'updated_resource_ids'], additionalProperties: false },
  }),
]

export async function handleLocalesTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, organization } = ctx
  if (toolName === 'list_organization_locales') {
    return await listOrganizationLocales(organization.db, organization.organizationId)
  }
  if (toolName === 'get_resource_localization') {
    const record = await getLocalizationForAuthoring(organization.env as CloudflareEnv, organization.db, organization.organizationId, requiredString(args, 'resource_type'), requiredString(args, 'resource_id'), requiredString(args, 'locale'))
    return { localization: record }
  }
  if (toolName === 'put_resource_localization') {
    const localization = await putLocalizationForAuthoring(organization.env as CloudflareEnv, organization.db, {
      organizationId: organization.organizationId,
      resourceType: requiredString(args, 'resource_type'),
      resourceId: requiredString(args, 'resource_id'),
      locale: requiredString(args, 'locale'),
      values: args.values,
      routePath: args.route_path,
      contentBlocks: args.content_blocks ?? undefined,
      expectedUpdatedAt: args.expected_updated_at ?? undefined,
      userId: organization.userId,
    })
    return { localization: localization, context: await mutationContextPayload(organization) }
  }
  if (toolName === 'delete_resource_localization') {
    const result = await deleteLocalization(organization.env as CloudflareEnv, organization.db, {
      organizationId: organization.organizationId,
      resourceType: requiredString(args, 'resource_type'),
      resourceId: requiredString(args, 'resource_id'),
      locale: requiredString(args, 'locale'),
    })
    return { ...result, context: await mutationContextPayload(organization) }
  }
  if (toolName === 'get_product_catalog_localization') {
    const catalog = await getProductCatalogLocalization(organization.env as CloudflareEnv, organization.db, organization.organizationId, requiredString(args, 'locale'))
    return { locale: catalog.locale, products: catalog.products }
  }
  if (toolName === 'replace_resource_localizations') {
    const result = await replaceResourceLocalizations(organization.env as CloudflareEnv, organization.db, {
      organizationId: organization.organizationId,
      resourceType: requiredString(args, 'resource_type'),
      locale: requiredString(args, 'locale'),
      items: args.items,
      userId: organization.userId,
    })
    return { ...result, context: await mutationContextPayload(organization) }
  }
  return NOT_HANDLED
}
