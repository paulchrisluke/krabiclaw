import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildLlmsFullTxt, getPublishedTenantBlogPostBySlug, listPublishedTenantBlogPostsForLlm, getPublishedPlatformDocBySlug, listPublishedPlatformBlogPostsForLlm, listPublishedPlatformDocsForLlm, renderTenantBlogMarkdown, resolvePublicOrigin, } from '~/server/utils/platform-llm'
import { getPlatformSite } from '~/server/utils/platform-site'
import { articleCategoryToSlug } from '~/utils/article-collections'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return textResponse('Database not available\n', { status: 500 })

  const origin = resolvePublicOrigin(event)
  const isTenant = event.context.tenantType === 'tenant'
  const siteId = isTenant ? String(event.context.siteId || '') : ''
  const siteName = (event.context.site as { brand_name?: string | null } | undefined)?.brand_name?.trim() || ''
  if (isTenant && siteId && !siteName) throw new HTTPError({ statusCode: 500, statusMessage: 'Tenant brand name is not configured' })

  if (isTenant && siteId) {
    const postSummaries = await listPublishedTenantBlogPostsForLlm(db, siteId, env)
    const posts = (await Promise.all(
      (postSummaries ?? []).map((post) => getPublishedTenantBlogPostBySlug(db, siteId, post.slug)), )).filter((post): post is NonNullable<typeof post> => Boolean(post))

    return textResponse(buildLlmsFullTxt(origin, [], posts, {
      title: `${siteName} Blog Full LLM Context`, intro: `Full machine-readable export of ${siteName}'s published blog.`, includeDocs: false, renderBlog: (post, origin) => renderTenantBlogMarkdown(post, origin, { themeId: String(event.context.themeId ?? '') }), }))
  }

  const [docSummaries, postSummaries] = await Promise.all([
    listPublishedPlatformDocsForLlm(db), listPublishedPlatformBlogPostsForLlm(db, env), ])

  const docs = (await Promise.all((docSummaries ?? []).flatMap((doc) => {
    const categorySlug = articleCategoryToSlug('docs', doc.category)
    return categorySlug ? [getPublishedPlatformDocBySlug(db, categorySlug, doc.slug)] : []
  })))
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))

  const platformSiteId = (await getPlatformSite(db)).id
  const posts = (await Promise.all(
    (postSummaries ?? []).map(post => getPublishedTenantBlogPostBySlug(db, platformSiteId, post.slug, 'blog')),
  )).filter((post): post is NonNullable<typeof post> => Boolean(post))

  return textResponse(buildLlmsFullTxt(origin, docs, posts))
})
