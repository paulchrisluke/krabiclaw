import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardAdminBlogPost } from '~/server/utils/dashboard-admin-blog'

export default defineEventHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) throw createError({ statusCode: 400, statusMessage: 'Post ID required' })
  return jsonResponse(await loadDashboardAdminBlogPost(event, postId))
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
