// PATCH /api/admin/blog/posts/[postId] - Update platform blog post
import { createDb } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { updatePlatformBlogPost } from '~/server/utils/platform-content'
import { rebuildPlatformKnowledgeIndex } from '~/server/utils/public-search'

import type { PlatformBlogPostRequestBody } from '~/server/types/platform-content'

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

  let body: PlatformBlogPostRequestBody
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await updatePlatformBlogPost(db, postId, body)
    try {
      await rebuildPlatformKnowledgeIndex(env, env.db ?? createDb(db))
    } catch (error) {
      console.error('Failed to rebuild platform knowledge index after blog post update:', error)
    }
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    if (statusCode >= 500) {
      console.error('Failed to update blog post:', err)
      return jsonResponse({ error: 'Failed to update post' }, { status: statusCode })
    }
    const message = err instanceof Error ? err.message : 'Failed to update post'
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
