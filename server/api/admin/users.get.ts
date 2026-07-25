import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { adminHeadersForEvent, authAdminApi, listPlatformUsers, platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const search = String(query.q || '').trim().toLowerCase()
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 50))
  const offset = Math.max(0, Number(query.offset) || 0)

  try {
    await requirePlatformEventPermission(event, env, { user: ['list'] })
    const result = await listPlatformUsers(authAdminApi(env), adminHeadersForEvent(event), {
      search,
      limit,
      offset,
    })
    return jsonResponse({ users: result.users, total: result.total })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, 'Failed to fetch users')
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
