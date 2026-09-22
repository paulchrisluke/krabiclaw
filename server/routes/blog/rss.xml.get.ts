import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildNamedBlogRss, buildTenantBlogLinkEntries, buildPlatformBlogLinkEntries, listPublishedTenantBlogPostsForLlm, listPublishedPlatformBlogPostsForLlm, resolvePublicOrigin, } from '~/server/utils/platform-llm'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const origin = resolvePublicOrigin(event)
  const isTenant = event.context.tenantType === 'tenant'
  const organizationId = isTenant ? String(event.context.organizationId || '') : ''

  if (isTenant && organizationId) {
    const siteName = (event.context.site as { name?: string | null } | undefined)?.name?.trim() || ''
    if (!siteName) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant brand name is not configured' })
    const posts = await listPublishedTenantBlogPostsForLlm(db, organizationId, env)
    const entries = buildTenantBlogLinkEntries(posts ?? [], origin, { themeId: String(event.context.themeId ?? '') })
    return textResponse(
      buildNamedBlogRss(origin, entries, {
        title: `${siteName} Blog`, description: `Published blog feed for ${siteName}.`, }), {}, 'application/rss+xml; charset=utf-8', )
  }

  const posts = await listPublishedPlatformBlogPostsForLlm(db, env)
  const entries = buildPlatformBlogLinkEntries(posts ?? [], origin)
  return textResponse(
    buildNamedBlogRss(origin, entries, {}), {}, 'application/rss+xml; charset=utf-8', )
})
