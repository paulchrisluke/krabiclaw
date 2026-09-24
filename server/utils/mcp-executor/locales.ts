import type { McpExecutorContext } from './shared'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  deleteLocalization,
  getProductCatalogLocalization,
  getLocalizationForAuthoring,
  putLocalizationForAuthoring,
  replaceResourceLocalizations,
} from '~/server/utils/localization'
import { listOrganizationLocales } from '~/server/utils/organization-locales'
import { NOT_HANDLED, mutationContextPayload, requiredString } from './shared'

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
