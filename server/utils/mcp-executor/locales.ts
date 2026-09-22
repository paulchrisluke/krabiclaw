import type { McpExecutorContext } from './shared'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  deleteLocalization,
  getProductCatalogLocalization,
  getLocalizationForAuthoring,
  putLocalizationForAuthoring,
  replaceResourceLocalizations,
} from '~/server/utils/localization'
import { listSiteLocales } from '~/server/utils/site-locales'
import { NOT_HANDLED, mutationContextPayload, requiredString } from './shared'

export async function handleLocalesTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  if (toolName === 'list_site_locales') {
    return await listSiteLocales(site.db, site.organizationId)
  }
  if (toolName === 'get_resource_localization') {
    const record = await getLocalizationForAuthoring(site.env as CloudflareEnv, site.db, site.organizationId, requiredString(args, 'resource_type'), requiredString(args, 'resource_id'), requiredString(args, 'locale'))
    return { localization: record }
  }
  if (toolName === 'put_resource_localization') {
    const localization = await putLocalizationForAuthoring(site.env as CloudflareEnv, site.db, {
      organizationId: site.organizationId,
      resourceType: requiredString(args, 'resource_type'),
      resourceId: requiredString(args, 'resource_id'),
      locale: requiredString(args, 'locale'),
      values: args.values,
      routePath: args.route_path,
      contentBlocks: args.content_blocks ?? undefined,
      expectedUpdatedAt: args.expected_updated_at ?? undefined,
      userId: site.userId,
    })
    return { localization: localization, context: await mutationContextPayload(site) }
  }
  if (toolName === 'delete_resource_localization') {
    const result = await deleteLocalization(site.env as CloudflareEnv, site.db, {
      organizationId: site.organizationId,
      resourceType: requiredString(args, 'resource_type'),
      resourceId: requiredString(args, 'resource_id'),
      locale: requiredString(args, 'locale'),
    })
    return { ...result, context: await mutationContextPayload(site) }
  }
  if (toolName === 'get_product_catalog_localization') {
    const catalog = await getProductCatalogLocalization(site.env as CloudflareEnv, site.db, site.organizationId, requiredString(args, 'locale'))
    return { locale: catalog.locale, products: catalog.products }
  }
  if (toolName === 'replace_resource_localizations') {
    const result = await replaceResourceLocalizations(site.env as CloudflareEnv, site.db, {
      organizationId: site.organizationId,
      resourceType: requiredString(args, 'resource_type'),
      locale: requiredString(args, 'locale'),
      items: args.items,
      userId: site.userId,
    })
    return { ...result, context: await mutationContextPayload(site) }
  }
  return NOT_HANDLED
}
