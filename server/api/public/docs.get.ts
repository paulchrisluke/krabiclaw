// GET /api/public/docs - List published platform docs
import { queryAll } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachFeaturedImageFromBareJoin } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const sql = `
    SELECT
      d.id, d.title, d.slug, d.excerpt, d.category, d.difficulty_level, d.seo_description, d.seo_keywords, d.canonical_url, d.robots, d.published_at, d.updated_at,
      d.featured_image_asset_id,
      ma.public_url,
      ma.kind,
      ma.width,
      ma.height
    FROM platform_docs d
    LEFT JOIN media_assets ma ON ma.id = d.featured_image_asset_id AND ma.status = 'active'
    WHERE d.status = 'published'
    ORDER BY d.category, d.sort_order, d.published_at DESC
  `

  try {
    const results = await queryAll<ApiRecord>(db, sql)
    return jsonResponse({ docs: (results ?? []).map(attachFeaturedImageFromBareJoin) })
  } catch (err) {
    console.error('Failed to fetch docs:', err)
    return jsonResponse({ error: 'Failed to load docs' }, { status: 500 })
  }
})
