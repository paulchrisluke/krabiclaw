// GET /api/admin/blog/posts/[postId] - Fetch single platform blog post (including draft)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { getPlatformBlogPost } from '~/server/utils/platform-content'

function auditLog(action: string, payload: ApiRecord) {
  console.info('[audit]', { action, timestamp: new Date().toISOString(), ...payload })
}

export default defineEventHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) return jsonResponse({ error: 'Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) {
    auditLog('admin_read_denied', {
      email: session.user.email,
      postId
    })
    return permissionDenied
  }

  try {
    const post = await getPlatformBlogPost(db, postId)
    auditLog('admin_read_post', {
      email: session.user.email,
      postId,
      postSlug: post.slug
    })
    return jsonResponse({ post })
  } catch (err) {
    if (typeof (err as { statusCode?: unknown })?.statusCode === 'number' && Number((err as { statusCode: number }).statusCode) === 404) {
      auditLog('admin_read_not_found', {
        email: session.user.email,
        postId
      })
      return jsonResponse({ error: 'Post not found' }, { status: 404 })
    }
    console.error('Failed to fetch admin blog post', { postId, error: err })
    return jsonResponse({ error: 'Failed to load post' }, { status: 500 })
  }
})
