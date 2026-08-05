import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { createTenantPage } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db, site, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    const body = await readBody(event)
    return jsonResponse(await createTenantPage(db, {
      organizationId: site.organization_id,
      siteId,
      userId,
      data: body,
    }), { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid tenant page' }, { status: 400 })
  }
})
