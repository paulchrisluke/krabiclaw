import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { archiveTenantPage } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, site, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const body = await readBody(event)
    return jsonResponse({ page: await archiveTenantPage(db, variantId, {
      userId,
      scope: { siteId, organizationId: site.organization_id },
      expectedDocumentUpdatedAt: String(body?.expectedDocumentUpdatedAt || ''),
      replacementPath: typeof body?.replacementPath === 'string' ? body.replacementPath : null,
      gone: body?.gone === true,
    }) })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unable to archive tenant page' }, { status: 400 })
  }
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
import { readBody } from 'h3'
