// GET /api/public/docs - List published platform docs
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const sql = `SELECT id, title, slug, excerpt, category, difficulty_level, published_at, updated_at FROM platform_docs WHERE status = 'published' ORDER BY category, sort_order, published_at DESC`

  try {
    const { results } = await db.prepare(sql).all()
    return jsonResponse({ docs: results ?? [] })
  } catch (err) {
    console.error('Failed to fetch docs:', err)
    return jsonResponse({ error: 'Failed to load docs' }, { status: 500 })
  }
})
