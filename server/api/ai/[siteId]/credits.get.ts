// GET /api/ai/[siteId]/credits — returns the org's current shared usage quota
import { jsonResponse } from '~/server/utils/api-response'
import { getAiQuotaStatus } from '~/server/utils/ai-credits'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const { db, site } = await requireSiteAccess(event, siteId, 'site-wide')

  const quota = await getAiQuotaStatus(db, site.organization_id)
  return jsonResponse({
    plan: quota.plan,
    planAllowance: quota.planAllowance,
    periodAllowance: quota.periodAllowance,
    periodUsed: quota.periodUsed,
    periodRemaining: quota.periodRemaining,
    periodStart: quota.periodStart,
    periodEnd: quota.periodEnd,
    lifetimeUsed: quota.lifetimeUsed,
    perChatCap: quota.sessionLimit,
    sessionUsed: quota.sessionUsed,
    sessionRemaining: quota.sessionRemaining,
    unlimited: quota.unlimited,
    reconciliationRequired: quota.reconciliationRequired,
  })
})
