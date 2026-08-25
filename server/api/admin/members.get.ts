import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { adminHeadersForEvent, authAdminApi, listPlatformAdminUsers, platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  try {
    await requirePlatformEventPermission(event, env, { user: ['list'] })
    const team = await listPlatformAdminUsers(authAdminApi(env), adminHeadersForEvent(event))
    return jsonResponse({ team })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, 'Failed to fetch members')
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
import { defineHandler } from 'nitro';
