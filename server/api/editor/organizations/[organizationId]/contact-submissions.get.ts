// GET /api/editor/sites/[organizationId]/contact-submissions
import { jsonResponse } from '~/server/utils/api-response'
import { listContactSubmissions } from '~/server/utils/mcp-workflows'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listAccessibleLocationIds, memberAccessPrincipal } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })

  const { env, db, site } = await requireSiteAccess(event, organizationId, 'context')
  const locationIds = await listAccessibleLocationIds(db, memberAccessPrincipal(site.membership, { env, organizationId, event }))

  const submissions = await listContactSubmissions(db, organizationId, { locationIds })
  return jsonResponse({ submissions })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
