// GET /api/admin/blog/posts - List platform blog posts
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { listPlatformBlogPosts } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) return permissionDenied

  const query = getQuery(event)
  const status = query.status as string | undefined

  return jsonResponse({ posts: await listPlatformBlogPosts(db, status) })
})
