// GET /api/editor/sites/[siteId]/contact-submissions
import { jsonResponse } from '~/server/utils/api-response'
import { listContactSubmissions } from '~/server/utils/mcp-workflows'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listAccessibleLocationIds, memberAccessPrincipal } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, siteId, 'context')
  const locationIds = await listAccessibleLocationIds(db, memberAccessPrincipal(site.membership, { env, siteId, event }))

  const submissions = await listContactSubmissions(db, siteId, { locationIds })
  return jsonResponse({ submissions })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
