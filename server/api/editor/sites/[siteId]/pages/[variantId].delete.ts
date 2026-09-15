import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { deleteTenantPage } from '~/server/utils/content/pages'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, site } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const payload = await deleteTenantPage(db, variantId, {
      scope: { siteId, organizationId: site.organization_id },
    })
    return jsonResponse(finalizeRequestMetrics(event, 'editor-tenant-page-delete', payload))
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Tenant page could not be deleted' }, { status: 400 })
  }
})
