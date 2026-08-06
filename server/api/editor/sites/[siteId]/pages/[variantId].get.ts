import { jsonResponse } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { getTenantPageById } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db, site } = await requireTenantPageWriteAccess(event, siteId)
  const page = await getTenantPageById(db, variantId, { siteId, organizationId: site.organization_id })
  return jsonResponse({ page })
})
