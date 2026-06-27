// Dynamic sitemap source for @nuxtjs/sitemap.
// Emits one entry per published post at its nested /blog/[category]/[slug] URL.
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { blogCategoryToSlug } from '~/utils/blog-categories'

export default defineSitemapEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const posts = await queryAll<ApiRecord>(
    db,
    `SELECT slug, category, updated_at FROM platform_blog_posts WHERE published_at IS NOT NULL`,
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
