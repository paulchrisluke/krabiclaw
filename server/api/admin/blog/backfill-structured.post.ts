import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { backfillLegacyBlogStructuredBlocks } from '~/server/utils/content-documents'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  const body = await readBody<{ apply?: boolean; site_id?: string | null }>(event)
  const report = await backfillLegacyBlogStructuredBlocks(db, {
    apply: body?.apply === true,
    ...(Object.prototype.hasOwnProperty.call(body ?? {}, 'site_id') ? { siteId: body.site_id ?? null } : {}),
  })
  return jsonResponse({ report })
})
