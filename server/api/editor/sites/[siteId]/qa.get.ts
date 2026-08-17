import { jsonResponse } from '~/server/utils/api-response'
import { listQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db } = await requireSiteAccess(event, siteId)
  const pagePath = typeof getQuery(event).page_path === 'string' ? String(getQuery(event).page_path) : null
  return jsonResponse({ qa: await listQa(db, siteId, null, false, pagePath) })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
