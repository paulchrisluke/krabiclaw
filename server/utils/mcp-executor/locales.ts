import type { McpExecutorContext } from './shared'
import {
  deleteResourceLocalization,
  getProductCatalogLocalization,
  getResourceLocalization,
  putResourceLocalization,
  syncProductCatalogLocalization,
  type ResourceLocalizationRecord,
} from '~/server/utils/localization'
import { listSiteLocales } from '~/server/utils/site-locales'
import { NOT_HANDLED, mutationContextPayload, requiredString } from './shared'

function toLocalizationObject(record: ResourceLocalizationRecord) {
  const { id, resource_type, resource_id, locale, values, route_path, document_id } = record
  return { id, resource_type, resource_id, locale, values, route_path, document_id }
}

export async function handleLocalesTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  if (toolName === 'list_site_locales') {
    return await listSiteLocales(site.db, site.organizationId, site.siteId)
  }
  if (toolName === 'get_resource_localization') {
    const record = await getResourceLocalization(site.db, site.organizationId, site.siteId, requiredString(args, 'resource_type'), requiredString(args, 'resource_id'), requiredString(args, 'locale'))
    return { localization: toLocalizationObject(record) }
  }
  if (toolName === 'put_resource_localization') {
    const localization = await putResourceLocalization(site.db, {
      organizationId: site.organizationId,
      siteId: site.siteId,
      resourceType: requiredString(args, 'resource_type'),
      resourceId: requiredString(args, 'resource_id'),
      locale: requiredString(args, 'locale'),
      values: args.values,
      routePath: args.route_path,
      userId: site.userId,
    })
    return { localization: toLocalizationObject(localization), context: await mutationContextPayload(site) }
  }
  if (toolName === 'delete_resource_localization') {
    const result = await deleteResourceLocalization(site.db, {
      organizationId: site.organizationId,
      siteId: site.siteId,
      resourceType: requiredString(args, 'resource_type'),
      resourceId: requiredString(args, 'resource_id'),
      locale: requiredString(args, 'locale'),
    })
    return { ...result, context: await mutationContextPayload(site) }
  }
  if (toolName === 'get_product_catalog_localization') {
    return await getProductCatalogLocalization(site.db, site.organizationId, site.siteId, requiredString(args, 'locale'))
  }
  if (toolName === 'sync_product_catalog_localization') {
    const result = await syncProductCatalogLocalization(site.db, {
      organizationId: site.organizationId,
      siteId: site.siteId,
      locale: requiredString(args, 'locale'),
      items: args.items,
      userId: site.userId,
    })
    return { ...result, context: await mutationContextPayload(site) }
  }
  return NOT_HANDLED
}
