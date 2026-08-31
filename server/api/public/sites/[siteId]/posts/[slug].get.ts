import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getPublishedPostBySlug } from '~/server/utils/post-management'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return apiErrorResponse(event, 400, 'POST_PARAMS_REQUIRED', 'Site ID and post slug are required')

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return apiErrorResponse(event, 503, 'DATABASE_UNAVAILABLE', 'Public post data is temporarily unavailable')

  const post = await getPublishedPostBySlug(db, siteId, slug, env)
  if (!post) return apiErrorResponse(event, 404, 'POST_NOT_FOUND', 'Post not found')

  return jsonResponse({ success: true, post })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
