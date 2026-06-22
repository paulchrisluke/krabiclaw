import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)

  if (!session?.user) {
    return jsonResponse({ allowed: false }, { status: 401 })
  }

  return jsonResponse({
    allowed: isPlatformAdmin(
      {
        role: (session.user as { role?: string | null }).role ?? null,
        email: session.user.email ?? null,
      },
      env,
    ),
  })
})
