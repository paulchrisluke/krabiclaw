// GET /api/public/blog/posts/[slug] - Get single published blog post with author
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  const post = await db.prepare(`
    SELECT
      p.id, p.title, p.slug, p.body, p.excerpt, p.category,
      p.published_at, p.created_at, p.updated_at,
      u.name  AS author_name,
      u.email AS author_email,
      u.image AS author_image,
      ma.public_url,
      ma.kind
    FROM platform_blog_posts p
    LEFT JOIN user u ON u.id = p.author_id
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE p.slug = ? AND p.published_at IS NOT NULL
  `).bind(slug).first()

  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ post })
})
