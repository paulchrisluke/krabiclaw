// GET /api/public/sites/[siteId]/blog/[slug] - Get a single published tenant blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedSiteBlogPost } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Site ID and slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const post = await getPublishedSiteBlogPost(db, siteId, slug)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })
  return jsonResponse({ post })
})
