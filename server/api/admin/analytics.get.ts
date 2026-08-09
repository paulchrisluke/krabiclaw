// GET /api/admin/analytics - Platform-wide analytics
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listAdminPortfolioOrganizations } from '~/server/utils/admin-portfolio'
import { platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['analytics'] })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error)
    return jsonResponse({ error: message }, { status: statusCode })
  }

  try {
    const organizations = await listAdminPortfolioOrganizations(db)
    const totals = organizations.reduce((summary, organization) => ({
      organizations: summary.organizations + 1,
      sites: summary.sites + organization.siteCount,
      locations: summary.locations + organization.locationCount,
      pageViews30d: summary.pageViews30d + organization.pageViews30d,
      sessions30d: summary.sessions30d + organization.sessions30d,
      previousPageViews30d: summary.previousPageViews30d + organization.previousPageViews30d,
    }), { organizations: 0, sites: 0, locations: 0, pageViews30d: 0, sessions30d: 0, previousPageViews30d: 0 })

    return jsonResponse({
      totals,
      organizations,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to fetch analytics:', error.stack || error.message)
    return jsonResponse({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
})
