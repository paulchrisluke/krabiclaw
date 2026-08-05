import { jsonResponse } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { getTenantPageById } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const variantId = getRouterParam(event, 'variantId')
  if (!siteId || !variantId) return jsonResponse({ error: 'Site and page IDs are required' }, { status: 400 })
  const { db } = await requireTenantPageWriteAccess(event, siteId)
  const page = await getTenantPageById(db, variantId)
  if (page.site_id !== siteId) return jsonResponse({ error: 'Page not found' }, { status: 404 })
  return jsonResponse({ page })
})
