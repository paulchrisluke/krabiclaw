import { jsonResponse } from '~/server/utils/api-response'
import { getSiteDomainsDashboardPayload } from '~/server/utils/domain-read-model'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })

  const { db } = await requireSiteAccess(event, siteId)

  const payload = await getSiteDomainsDashboardPayload(db, siteId)

  return jsonResponse({ success: true, ...payload, siteId })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
