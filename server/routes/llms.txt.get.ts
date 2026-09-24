import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildLlmsTxt, buildTenantBlogLinkEntries, buildPlatformBlogLinkEntries, buildPlatformDocLinkEntries, listPublishedTenantBlogPostsForLlm, listPublishedPlatformBlogPostsForLlm, listPublishedPlatformDocsForLlm, resolvePublicOrigin, } from '~/server/utils/platform-llm'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const origin = resolvePublicOrigin(event)
  const isTenant = event.context.tenantType === 'tenant'
  const organizationId = isTenant ? String(event.context.organizationId || '') : ''
  const organizationName = (event.context.organization as { name?: string | null } | undefined)?.name?.trim() || ''
  if (isTenant && organizationId && !organizationName) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant brand name is not configured' })

  if (isTenant && organizationId) {
    const posts = await listPublishedTenantBlogPostsForLlm(db, organizationId, env)
    return textResponse(
      buildLlmsTxt(
        origin, [], buildTenantBlogLinkEntries(posts ?? [], origin, { themeId: String(event.context.themeId ?? '') }), {
          title: `${organizationName} Blog`, intro: `${organizationName} publishes blog content available as HTML and Markdown mirrors.`, includeDocsOptionalLinks: false, blogIndexDescription: 'Machine-readable manifest of published tenant blog posts.', blogRssDescription: 'Chronological feed for published tenant blog posts.', blogJsonFeedDescription: 'JSON Feed export for published tenant blog posts.', fullContextDescription: 'Aggregated export of published tenant blog posts.', }, ), )
  }

  const [docs, posts] = await Promise.all([
    listPublishedPlatformDocsForLlm(db), listPublishedPlatformBlogPostsForLlm(db, env), ])

  return textResponse(
    buildLlmsTxt(
      origin, buildPlatformDocLinkEntries(docs ?? [], origin), buildPlatformBlogLinkEntries(posts ?? [], origin), ), )
})
