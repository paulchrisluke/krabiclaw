// GET /api/public/blog/posts - List published platform blog posts
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const category = query.category as string | undefined
  const limit = Math.min(parseInt(query.limit as string || '20'), 100)

  let sql = `SELECT id, title, slug, excerpt, category, published_at FROM platform_blog_posts WHERE published_at IS NOT NULL`
  const params: unknown[] = []

  if (category) {
    sql += ` AND category = ?`
    params.push(category)
  }

  sql += ` ORDER BY published_at DESC LIMIT ?`
  params.push(limit)

  const { results } = await db.prepare(sql).bind(...params).all()
  return jsonResponse({ posts: results ?? [] })
})
