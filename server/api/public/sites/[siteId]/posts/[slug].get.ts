import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPostBySlug } from '~/server/utils/post-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'Site ID and post slug required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const post = await getPublishedPostBySlug(db, siteId, slug, env)
  if (!post) return jsonResponse({ error: 'Post not found' }, { status: 404 })

  return jsonResponse({ success: true, post })
})
