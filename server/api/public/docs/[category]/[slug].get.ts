// GET /api/public/docs/[category]/[slug] - Get single published doc, scoped to its category
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachFeaturedImageFromBareJoin, listContentComponents, resolveContentComponentsMedia } from '~/server/utils/platform-content'
import { slugToCategory } from '~/utils/docs-categories'

export default defineEventHandler(async (event) => {
  const categorySlug = getRouterParam(event, 'category')
  const slug = getRouterParam(event, 'slug')
  if (!categorySlug || !slug) return jsonResponse({ error: 'Category and slug required' }, { status: 400 })

  const category = slugToCategory(categorySlug)
  if (!category) return jsonResponse({ error: 'Documentation not found' }, { status: 404 })

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
       WHERE p.slug = ? AND p.category = ? AND p.status = 'published'`,
      [slug, category],
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
