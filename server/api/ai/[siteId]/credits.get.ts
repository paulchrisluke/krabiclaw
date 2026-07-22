// GET /api/ai/[siteId]/credits — returns the org's current AI credit balance
import { jsonResponse } from '~/server/utils/api-response'
import { getOrCreateCredits } from '~/server/utils/ai-credits'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, 'site-wide')

  const credits = await getOrCreateCredits(db, site.organization_id)
  const total = credits.balance + credits.lifetime_used
  return jsonResponse({ balance: credits.balance, lifetime_used: credits.lifetime_used, total })
})
