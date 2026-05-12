// GET /api/public/blog/posts/[slug] - Get single published blog post by slug
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  const post = await db.prepare(
    `SELECT id, title, slug, body, excerpt, category, published_at FROM platform_blog_posts WHERE slug = ? AND published_at IS NOT NULL`
  ).bind(slug).first()

  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ post })
})
