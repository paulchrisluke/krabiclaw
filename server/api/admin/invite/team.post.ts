// POST /api/admin/invite/team - promote existing user to admin, or create new admin account
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { addPlatformAdminUser, adminHeadersForEvent, authAdminApi, platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const body = await readBody(event).catch(() => ({})) as { email?: string; name?: string }
  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  if (!email) return jsonResponse({ error: 'Email is required' }, { status: 400 })

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: 'Invalid email' }, { status: 400 })
  }

  try {
    await requirePlatformEventPermission(event, env, { user: ['create', 'set-role'] })
    const result = await addPlatformAdminUser(authAdminApi(env), adminHeadersForEvent(event), { email, name })
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, 'Failed to add team member')
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
