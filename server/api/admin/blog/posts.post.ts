import { defineHandler } from 'nitro';
// POST /api/admin/blog/posts - Create platform blog post
import { cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { createPlatformBlogPost } from '~/server/utils/platform-content'
import { platformBlogCreateInput } from '~/server/utils/platform-content-request'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'

import type { PlatformBlogPostRequestBody } from '~/server/types/platform-content'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) return permissionDenied

  let body: PlatformBlogPostRequestBody
  try { body = await readRequiredBody<PlatformBlogPostRequestBody>(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await createPlatformBlogPost(db, session.user.id, platformBlogCreateInput(body), {}, env)
    schedulePlatformKnowledgeIndexRebuild(event, env, 'blog post create')
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to create post'
    if (statusCode >= 500) console.error('Failed to create blog post:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
