import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { listAdminPortfolioOrganizations } from '~/server/utils/admin-portfolio'
import { platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['organizations'] })
    return jsonResponse({ organizations: await listAdminPortfolioOrganizations(db) })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, 'Failed to load organizations')
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
