// GET /api/public/blog - List published platform blog posts
import { queryAll } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachFeaturedImageFromBareJoin } from '~/server/utils/platform-content'
import { blogCategoryToSlug } from '~/utils/blog-categories'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const sql = `
    SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.seo_description, p.seo_keywords, p.canonical_url, p.robots, p.published_at,
      p.nav_section, p.nav_title, p.nav_order, p.nav_section_order, p.hide_from_nav, p.featured_order,
      p.featured_image_asset_id,
      ma.public_url,
      ma.kind,
      ma.width,
      ma.height
    FROM blog_posts p
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE p.status = 'published' AND p.site_id IS NULL
    ORDER BY COALESCE(p.featured_order, 999999), COALESCE(p.nav_section_order, 999999), COALESCE(p.nav_section, p.category), COALESCE(p.nav_order, 999999), p.published_at DESC
    LIMIT 100
  `

  try {
    const results = await queryAll<ApiRecord>(db, sql)
    const posts = (results ?? [])
      .filter(post => blogCategoryToSlug(post.category))
      .map(attachFeaturedImageFromBareJoin)
    return jsonResponse({ posts })
  } catch (err) {
    console.error('Failed to fetch public blog posts:', err)
    return jsonResponse({ error: 'Failed to fetch posts' }, { status: 500 })
  }
})
