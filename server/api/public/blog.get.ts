// GET /api/public/blog - List published platform blog posts
import { queryAll } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachFeaturedImageFromBareJoin } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const sql = `
    SELECT
      p.id, p.title, p.slug, p.excerpt, p.category, p.seo_description, p.seo_keywords, p.canonical_url, p.robots, p.published_at,
      p.featured_image_asset_id,
      ma.public_url,
      ma.kind,
      ma.width,
      ma.height
    FROM platform_blog_posts p
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE p.published_at IS NOT NULL
    ORDER BY p.category, p.published_at DESC
  `

  try {
    const results = await queryAll<ApiRecord>(db, sql)
    return jsonResponse({ posts: (results ?? []).map(attachFeaturedImageFromBareJoin) })
  } catch (err) {
    console.error('Failed to fetch public blog posts:', err)
    return jsonResponse({ error: 'Failed to fetch posts' }, { status: 500 })
  }
})
