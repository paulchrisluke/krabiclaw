import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { updateTenantPageDraft } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, site, userId } = await requireTenantPageWriteAccess(event, siteId)
  try {
    return jsonResponse(await updateTenantPageDraft(db, variantId, {
      userId,
      scope: { siteId, organizationId: site.organization_id },
      data: await readBody(event),
    }))
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid tenant page draft' }, { status: 400 })
  }
})
