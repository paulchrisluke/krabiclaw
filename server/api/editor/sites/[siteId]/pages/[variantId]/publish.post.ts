import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { publishTenantPage } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, site, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const body = await readBody(event)
    return jsonResponse({ page: await publishTenantPage(db, variantId, {
      userId,
      scope: { siteId, organizationId: site.organization_id },
      expectedDocumentUpdatedAt: String(body?.expectedDocumentUpdatedAt || ''),
    }) })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to publish tenant page' }, { status: 400 })
  }
})
