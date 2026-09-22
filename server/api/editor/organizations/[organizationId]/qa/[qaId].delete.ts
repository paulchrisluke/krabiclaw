import { jsonResponse } from '~/server/utils/api-response'
import { deleteQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const qaId = getRouterParam(event, 'qaId')
  if (!organizationId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })
  const { db, site } = await requireSiteAccess(event, organizationId)
  const pagePath = typeof getQuery(event).page_path === 'string' ? String(getQuery(event).page_path) : null
  const result = await deleteQa(db, { organizationId: site.organization_id, locationId: null, pagePath }, qaId)
  return jsonResponse(result.data, { status: result.status })
})
import { defineHandler } from 'nitro';
import { getQuery, getRouterParam  } from 'nitro/h3';
