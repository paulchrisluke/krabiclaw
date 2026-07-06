// DELETE /api/admin/blog/posts/[postId] - Delete platform blog post
import { createDb } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { deletePlatformBlogPost } from '~/server/utils/platform-content'
import { rebuildPlatformKnowledgeIndex } from '~/server/utils/public-search'

export default defineEventHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) return jsonResponse({ error: 'Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  try {
    const result = await deletePlatformBlogPost(db, postId)
    try {
      await rebuildPlatformKnowledgeIndex(env, env.db ?? createDb(db))
    } catch (error) {
      console.error('Failed to rebuild platform knowledge index after blog post delete:', error)
    }
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to delete post'
    if (statusCode >= 500) console.error('Failed to delete blog post:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
