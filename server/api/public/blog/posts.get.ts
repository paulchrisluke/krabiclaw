// GET /api/public/blog/posts - List published platform blog posts
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachFeaturedImageFromBareJoin } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const category = query.category as string | undefined
  let parsedLimit = Number.parseInt(query.limit as string, 10)
  if (Number.isNaN(parsedLimit)) {
    parsedLimit = 20
  }
  const limit = Math.max(1, Math.min(parsedLimit, 100))

  let sql = `
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
  `
  const params: (string | number)[] = []

  if (category) {
    sql += ` AND p.category = ?`
    params.push(category)
  }

  sql += ` ORDER BY p.published_at DESC LIMIT ?`
  params.push(limit)

  try {
    const { results } = await db.prepare(sql).bind(...params).all()
    return jsonResponse({ posts: (results ?? []).map(attachFeaturedImageFromBareJoin) })
  } catch (err) {
    console.error('Failed to fetch public blog posts:', err)
    return jsonResponse({ error: 'Failed to fetch posts' }, { status: 500 })
  }
})
