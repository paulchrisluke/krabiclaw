import { jsonResponse } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listTenantPages } from '~/server/utils/tenant-pages'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db } = await requireSiteAccess(event, siteId)
  
  const pages = await listTenantPages(db, siteId)
  return jsonResponse(pages.map(page => ({ path: page.path, title: page.title })))
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
