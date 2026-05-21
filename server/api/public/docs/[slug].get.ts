// GET /api/public/docs/[slug] - Get single published doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    const doc = await db.prepare(
      `SELECT id, title, slug, body, excerpt, category, seo_description, seo_keywords, difficulty_level, featured_image_asset_id, published_at, updated_at FROM platform_docs WHERE slug = ? AND status = 'published'`
    ).bind(slug).first() as ApiRecord | null

    if (!doc) {
      return jsonResponse({ error: 'Documentation not found' }, { status: 404 })
    }

    return jsonResponse({ doc })
  } catch (err) {
    console.error('Failed to fetch doc:', err)
    return jsonResponse({ error: 'Failed to load doc' }, { status: 500 })
  }
})
