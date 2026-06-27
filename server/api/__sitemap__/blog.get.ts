// Dynamic sitemap source for @nuxtjs/sitemap.
// Emits one entry per published post. On the platform host this is the
// category-nested platform blog (/blog/[category]/[slug]); on a tenant host
// (resolved by server/middleware/tenant-resolution.ts) it's that site's own
// blog (/blog/[slug]) — same source, scoped by event.context.siteId.
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { blogCategoryToSlug } from '~/utils/blog-categories'

export default defineSitemapEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const siteId = event.context.tenantType === 'tenant' ? (event.context.siteId as string | undefined) : null

  if (event.context.tenantType === 'tenant' && !siteId) return []

  if (siteId) {
    const posts = await queryAll<ApiRecord>(
      db,
      `SELECT slug, updated_at FROM blog_posts WHERE published_at IS NOT NULL AND site_id = ?`,
      [siteId],
    )
    return (posts ?? [])
      .filter(post => post.slug)
      .map(post => ({ loc: `/blog/${post.slug}`, lastmod: post.updated_at as string | undefined }))
  }

  const posts = await queryAll<ApiRecord>(
    db,
    `SELECT slug, category, updated_at FROM blog_posts WHERE published_at IS NOT NULL AND site_id IS NULL`,
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
