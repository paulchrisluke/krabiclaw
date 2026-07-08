import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildNamedBlogRss,
  buildTenantBlogLinkEntries,
  buildPlatformBlogLinkEntries,
  listPublishedTenantBlogPostsForLlm,
  listPublishedPlatformBlogPostsForLlm,
  resolvePublicOrigin,
} from '~/server/utils/platform-llm'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const origin = resolvePublicOrigin(event)
  const isTenant = event.context.tenantType === 'tenant'
  const siteId = isTenant ? String(event.context.siteId || '') : ''
  const siteName = String(event.context.site?.brand_name || 'Site')
  const posts = isTenant && siteId
    ? await listPublishedTenantBlogPostsForLlm(db, siteId)
    : await listPublishedPlatformBlogPostsForLlm(db)
  const entries = isTenant && siteId
    ? buildTenantBlogLinkEntries(posts ?? [], origin)
    : buildPlatformBlogLinkEntries(posts ?? [], origin)
  return textResponse(
    buildNamedBlogRss(origin, entries, isTenant ? {
      title: `${siteName} Blog`,
      description: `Published blog feed for ${siteName}.`,
    } : {}),
    {},
    'application/rss+xml; charset=utf-8',
  )
})
