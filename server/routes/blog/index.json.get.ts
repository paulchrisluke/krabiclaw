import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildBlogIndexJson,
  buildTenantBlogLinkEntries,
  buildPlatformBlogLinkEntries,
  listPublishedTenantBlogPostsForLlm,
  listPublishedPlatformBlogPostsForLlm,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const origin = resolvePublicOrigin(event)
  const isTenant = event.context.tenantType === 'tenant'
  const siteId = isTenant ? String(event.context.siteId || '') : ''
  const posts = isTenant && siteId
    ? await listPublishedTenantBlogPostsForLlm(db, siteId)
    : await listPublishedPlatformBlogPostsForLlm(db)
  const entries = isTenant && siteId
    ? buildTenantBlogLinkEntries(posts ?? [], origin)
    : buildPlatformBlogLinkEntries(posts ?? [], origin)
  return jsonResponse(buildBlogIndexJson(entries))
})
