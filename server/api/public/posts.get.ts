import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPosts } from '~/server/utils/post-management'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  if (!organizationId) return jsonResponse({ error: 'Unknown tenant' }, { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const query = getQuery(event)
  const parsedLimit = Number(query.limit ?? 20)
  const limit = Math.min(Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1, 50)
  const locationId = typeof query.location_id === 'string' ? query.location_id : undefined
  const posts = await getPublishedPosts(db, organizationId, limit, locationId)
  return jsonResponse({ success: true, posts })
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
