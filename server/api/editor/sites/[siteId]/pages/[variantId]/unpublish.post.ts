import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { unpublishTenantPage } from '~/server/utils/tenant-pages'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, site, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const body = await readRequiredBody<{ expectedDocumentUpdatedAt?: unknown }>(event)
    return jsonResponse({ page: await unpublishTenantPage(db, variantId, {
      userId, scope: { siteId, organizationId: site.organization_id }, expectedDocumentUpdatedAt: String(body?.expectedDocumentUpdatedAt || ''), }) })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to unpublish tenant page' }, { status: 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam  } from 'nitro/h3';
