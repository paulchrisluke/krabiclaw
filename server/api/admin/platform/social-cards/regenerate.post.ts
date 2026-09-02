import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { ensurePlatformMediaScope } from '~/server/utils/platform-media'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { regenerateSiteSocialCards } from '~/server/utils/social-card'
import { PLATFORM_SITE_ID } from '~/shared/platform-scope'
import { summarizeSocialCardRefreshResults } from '~/utils/social-card-refresh'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const denied = await platformPermissionJsonResponse(event, env, { platform: ['media'] })
  if (denied) return denied
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  await ensurePlatformMediaScope(env, db)
  const results = await regenerateSiteSocialCards({ db, env, siteId: PLATFORM_SITE_ID, actorId: session.user.id })
  return jsonResponse({ results, summary: summarizeSocialCardRefreshResults(results) })
})
