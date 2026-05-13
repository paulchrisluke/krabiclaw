// DELETE /api/admin/blog/posts/[postId] - Delete platform blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) return jsonResponse({ error: 'Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  try {
    const result = await db.prepare(`DELETE FROM platform_blog_posts WHERE id = ?`).bind(postId).run()
    if (!result.changes || result.changes === 0) {
      return jsonResponse({ error: 'Post not found' }, { status: 404 })
    }
  } catch (err) {
    console.error('Failed to delete blog post:', err)
    return jsonResponse({ error: 'Failed to delete post' }, { status: 500 })
  }

  return jsonResponse({ success: true })
})
