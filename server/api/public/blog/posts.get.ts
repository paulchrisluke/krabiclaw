// GET /api/public/blog/posts - List published platform blog posts
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const category = query.category as string | undefined
  let parsedLimit = Number.parseInt(query.limit as string, 10)
  if (Number.isNaN(parsedLimit)) {
    parsedLimit = 20
  }
  const limit = Math.max(1, Math.min(parsedLimit, 100))

  let sql = `SELECT id, title, slug, excerpt, category, published_at FROM platform_blog_posts WHERE published_at IS NOT NULL`
  const params: unknown[] = []

  if (category) {
    sql += ` AND category = ?`
    params.push(category)
  }

  sql += ` ORDER BY published_at DESC LIMIT ?`
  params.push(limit)

  try {
    const { results } = await db.prepare(sql).bind(...params).all()
    return jsonResponse({ posts: results ?? [] })
  } catch (err) {
    console.error('Failed to fetch public blog posts:', err)
    return jsonResponse({ error: 'Failed to fetch posts' }, { status: 500 })
  }
})
