// Dynamic sitemap source for @nuxtjs/sitemap.
// Emits one entry per published post. On the platform host this is the
// category-nested platform blog (/blog/[category]/[slug]); on a tenant host
// (resolved by server/middleware/tenant-resolution.ts) it's that site's own
// blog (/blog/[slug]) — same source, scoped by event.context.siteId.
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { blogCategoryToSlug } from '~/utils/blog-categories'
import { TENANT_TYPES } from '~/utils/tenant-routing'

export default defineSitemapEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return []

  const siteId = event.context.tenantType === TENANT_TYPES.TENANT ? (event.context.siteId as string | undefined) : null

  if (event.context.tenantType === TENANT_TYPES.TENANT && !siteId) return []

  // hide_from_nav is a nav-UI-only concern (sidebar/menu visibility) and does not gate
  // sitemap/indexing — robots is the correct signal for search-engine inclusion.
  if (siteId) {
    const site = await queryFirst<{ vertical: string | null; theme_id: string | null }>(
      db,
      `SELECT vertical, theme_id FROM sites WHERE id = ?`,
      [siteId],
    )
    const isProfessionalServiceSite = site?.vertical === 'service' || site?.theme_id === 'blawby-theme-v1'
    const posts = await queryAll<ApiRecord>(
      db,
      `SELECT slug, updated_at FROM blog_posts WHERE status = 'published' AND site_id = ? AND (robots IS NULL OR robots NOT LIKE '%noindex%')`,
      [siteId],
    )
    return (posts ?? [])
      .filter(post => post.slug)
      .map(post => ({
        loc: isProfessionalServiceSite ? `/article/${post.slug}` : `/blog/${post.slug}`,
        lastmod: post.updated_at as string | undefined,
      }))
  }

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
