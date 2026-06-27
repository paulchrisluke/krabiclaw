// GET /api/public/sites/[siteId]/blog/[slug] - Get a single published tenant blog post
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { attachFeaturedImageFromBareJoin, listContentComponents, resolveContentComponentsMedia } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Site ID and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const post = await queryFirst<ApiRecord>(db, `
    SELECT
      p.id, p.title, p.slug, p.body, p.excerpt, p.category, p.seo_description, p.seo_keywords,
      p.canonical_url, p.robots,
      p.published_at, p.created_at, p.updated_at,
      p.featured_image_asset_id,
      u.name AS author_name,
      u.email AS author_email,
      u.image AS author_image,
      ma.public_url,
      ma.kind,
      ma.width,
      ma.height
    FROM blog_posts p
    LEFT JOIN user u ON u.id = p.author_id
    LEFT JOIN media_assets ma ON ma.id = p.featured_image_asset_id AND ma.status = 'active'
    WHERE p.slug = ? AND p.site_id = ? AND p.published_at IS NOT NULL
  `, [slug, siteId])

  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  const components = await resolveContentComponentsMedia(db, await listContentComponents(db, 'blog_post', String(post.id), { activeOnly: true }))

  return jsonResponse({ post: attachFeaturedImageFromBareJoin({ ...post, components }) })
})
