import { jsonResponse } from '~/server/utils/api-response'
import { requireTenantPageWriteAccess } from '~/server/utils/tenant-pages-api'
import { listTenantPages } from '~/server/utils/tenant-pages'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db } = await requireTenantPageWriteAccess(event, siteId)
  const locale = getQuery(event).locale
  return jsonResponse({ pages: await listTenantPages(db, siteId, { locale: typeof locale === 'string' ? locale : null }) })
})
