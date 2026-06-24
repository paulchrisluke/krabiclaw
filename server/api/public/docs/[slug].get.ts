// GET /api/public/docs/[slug] - Get single published doc
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachFeaturedImageFromBareJoin, listContentComponents, resolveContentComponentsMedia } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) return jsonResponse({ error: 'Slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    const doc = await queryFirst<ApiRecord>(
      db,
      `SELECT
         p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.difficulty_level,
         p.seo_description, p.seo_keywords, p.canonical_url, p.robots,
         p.featured_image_asset_id, p.published_at, p.updated_at,
         ma.public_url, ma.kind, ma.width, ma.height
       FROM platform_docs p
       LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
       WHERE p.slug = ? AND p.status = 'published'`,
      [slug],
    )

    if (!doc) {
      return jsonResponse({ error: 'Documentation not found' }, { status: 404 })
    }

    const components = await resolveContentComponentsMedia(db, await listContentComponents(db, 'doc', String(doc.id), { activeOnly: true }))

    return jsonResponse({ doc: attachFeaturedImageFromBareJoin({ ...doc, components }) })
  } catch (err) {
    console.error('Failed to fetch doc:', err)
    return jsonResponse({ error: 'Failed to load doc' }, { status: 500 })
  }
})
