import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { backfillLegacyBlogStructuredBlocks } from '~/server/utils/content-documents'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) return permissionDenied
  const body = await readBody<{ apply?: boolean; site_id?: string | null }>(event)
  const report = await backfillLegacyBlogStructuredBlocks(db, {
    apply: body?.apply === true,
    ...(Object.prototype.hasOwnProperty.call(body ?? {}, 'site_id') ? { siteId: body.site_id ?? null } : {}),
  })
  return jsonResponse({ report })
})
