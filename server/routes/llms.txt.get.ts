import { cloudflareEnv, textResponse } from '~/server/utils/api-response'
import {
  buildLlmsTxt,
  buildTenantBlogLinkEntries,
  buildPlatformBlogLinkEntries,
  buildPlatformDocLinkEntries,
  listPublishedTenantBlogPostsForLlm,
  listPublishedPlatformBlogPostsForLlm,
  listPublishedPlatformDocsForLlm,
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

  if (isTenant && siteId) {
    const posts = await listPublishedTenantBlogPostsForLlm(db, siteId)
    return textResponse(
      buildLlmsTxt(
        origin,
        [],
        buildTenantBlogLinkEntries(posts ?? [], origin),
        {
          title: `${siteName} Blog`,
          intro: `${siteName} publishes blog content available as HTML and Markdown mirrors.`,
          includeDocsOptionalLinks: false,
          blogIndexDescription: 'Machine-readable manifest of published tenant blog posts.',
          blogRssDescription: 'Chronological feed for published tenant blog posts.',
          blogJsonFeedDescription: 'JSON Feed export for published tenant blog posts.',
          fullContextDescription: 'Aggregated export of published tenant blog posts.',
        },
      ),
    )
  }

  const [docs, posts] = await Promise.all([
    listPublishedPlatformDocsForLlm(db),
    listPublishedPlatformBlogPostsForLlm(db),
  ])

  return textResponse(
    buildLlmsTxt(
      origin,
      buildPlatformDocLinkEntries(docs ?? [], origin),
      buildPlatformBlogLinkEntries(posts ?? [], origin),
    ),
  )
})
