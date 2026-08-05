import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { unpublishTenantPage } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const body = await readBody(event)
    return jsonResponse({ page: await unpublishTenantPage(db, variantId, {
      userId,
      expectedDocumentUpdatedAt: String(body?.expectedDocumentUpdatedAt || ''),
    }) })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to unpublish tenant page' }, { status: 400 })
  }
})
