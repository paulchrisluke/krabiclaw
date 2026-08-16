import { HTTPError, defineHandler  } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardAdminBlogPost } from '~/server/utils/dashboard-admin-blog'

export default defineHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) throw new HTTPError({ statusCode: 400, statusMessage: 'Post ID required' })
  return jsonResponse(await loadDashboardAdminBlogPost(event, postId))
})
import { getRouterParam } from 'nitro/h3';
