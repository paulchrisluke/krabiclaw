import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAdminPortfolioSite } from '~/server/utils/admin-portfolio'
import { platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['organizations'] })
    const result = await getAdminPortfolioSite(
      db,
      getRouterParam(event, 'orgId') || '',
      getRouterParam(event, 'siteId') || '',
    )
    return result
      ? jsonResponse(result)
      : jsonResponse({ error: 'Site not found' }, { status: 404 })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, 'Failed to load site')
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
