import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import {
  buildNamedBlogJsonFeed,
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
  const siteName = event.context.site?.brand_name?.trim() || ''
  if (isTenant && siteId && !siteName) throw createError({ statusCode: 500, statusMessage: 'Tenant brand name is not configured' })
  const posts = isTenant && siteId
    ? await listPublishedTenantBlogPostsForLlm(db, siteId)
    : await listPublishedPlatformBlogPostsForLlm(db)
  const entries = isTenant && siteId
    ? buildTenantBlogLinkEntries(posts ?? [], origin)
    : buildPlatformBlogLinkEntries(posts ?? [], origin)
  return jsonResponse(buildNamedBlogJsonFeed(origin, entries, isTenant ? {
    title: `${siteName} Blog`,
    description: `Published blog feed for ${siteName}.`,
    authorName: siteName,
  } : {}))
})
import { defineEventHandler } from 'h3'
