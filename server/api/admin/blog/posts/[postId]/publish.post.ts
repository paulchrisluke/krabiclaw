import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { parsePlatformBlogLifecycleInput, updatePlatformBlogLifecycle } from '~/server/utils/platform-content'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'

export default defineHandler(async (event) => {
  const postId = getRouterParam(event, 'postId')
  if (!postId) return jsonResponse({ error: 'Post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) return permissionDenied

  try {
    const input = parsePlatformBlogLifecycleInput(await readBody(event) as unknown, 'publish')
    const lifecycle = await updatePlatformBlogLifecycle(db, postId, input)
    schedulePlatformKnowledgeIndexRebuild(event, env, 'blog post publish')
    return jsonResponse({ success: true, lifecycle })
  } catch (error) {
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number' ? Number((error as { statusCode: number }).statusCode) : 500
    if (statusCode >= 500) console.error('Failed to publish blog post:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to publish post' }, { status: statusCode })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
