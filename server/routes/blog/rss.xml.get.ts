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

  if (isTenant && siteId) {
    const siteName = event.context.site?.brand_name?.trim() || ''
    if (!siteName) throw createError({ statusCode: 500, statusMessage: 'Tenant brand name is not configured' })
    const posts = await listPublishedTenantBlogPostsForLlm(db, siteId)
    const entries = buildTenantBlogLinkEntries(posts ?? [], origin)
    return textResponse(
      buildNamedBlogRss(origin, entries, {
        title: `${siteName} Blog`,
        description: `Published blog feed for ${siteName}.`,
      }),
      {},
      'application/rss+xml; charset=utf-8',
    )
  }

  const posts = await listPublishedPlatformBlogPostsForLlm(db)
  const entries = buildPlatformBlogLinkEntries(posts ?? [], origin)
  return textResponse(
    buildNamedBlogRss(origin, entries, {}),
    {},
    'application/rss+xml; charset=utf-8',
  )
})
import { defineEventHandler } from 'h3'
