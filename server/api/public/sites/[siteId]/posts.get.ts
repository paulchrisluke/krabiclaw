import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPosts } from '~/server/utils/post-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit ?? 20), 50)
  const locationId = typeof query.location_id === 'string' ? query.location_id : undefined
  const posts = await getPublishedPosts(db, siteId, limit, locationId)
  return jsonResponse({ success: true, posts })
})
