// Dynamic sitemap source for @nuxtjs/sitemap.
// Emits one entry per published post. On the platform host this is the
// category-nested platform blog (/blog/[category]/[slug]); on a tenant host
// it's that site's own blog (/blog/[slug]).
import { getRequestURL } from 'h3'
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isNonIndexableHost } from '~/server/utils/seo-policy'
import { blogCategoryToSlug } from '~/utils/blog-categories'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
  if (isNonIndexableHost(getRequestURL(event).hostname)) return []

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const siteId = event.context.tenantType === TENANT_TYPES.TENANT ? (event.context.siteId as string | undefined) : null
  if (event.context.tenantType === TENANT_TYPES.TENANT && !siteId) return []

  // hide_from_nav is a nav-UI-only concern. robots is the indexing signal.
  if (siteId) {
    const posts = await queryAll<ApiRecord>(
      db,
      `SELECT slug, updated_at FROM blog_posts WHERE status = 'published' AND site_id = ? AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
      [siteId],
    )
    return (posts ?? [])
      .filter(post => post.slug)
      .map(post => ({ loc: `/blog/${post.slug}`, lastmod: post.updated_at as string | undefined }))
  }

  if (event.context.tenantType !== TENANT_TYPES.PLATFORM) return []

  const posts = await queryAll<ApiRecord>(
    db,
    `SELECT slug, category, updated_at FROM blog_posts WHERE status = 'published' AND site_id IS NULL AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
  )

  const entries: Array<{ loc: string; lastmod: string | undefined }> = []
  for (const post of posts ?? []) {
    const categorySlug = blogCategoryToSlug(post.category as string | null)
    if (!categorySlug || !post.slug) continue
    entries.push({
      loc: `/blog/${categorySlug}/${post.slug}`,
      lastmod: post.updated_at as string | undefined,
    })
  }
  return entries
})
