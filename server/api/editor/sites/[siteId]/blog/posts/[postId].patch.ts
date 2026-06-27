// PATCH /api/editor/sites/[siteId]/blog/posts/[postId] - Update a tenant blog post
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updatePlatformBlogPost } from '~/server/utils/platform-content'
import { queryFirst } from '~/server/db'

import type { PlatformBlogPostRequestBody } from '~/server/types/platform-content'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const postId = getRouterParam(event, 'postId')
  if (!siteId || !postId) return jsonResponse({ error: 'Site ID and post ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string }>(db, `
    SELECT s.id FROM sites s
    JOIN organization o ON s.organization_id = o.id
    JOIN member m ON o.id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin','editor') LIMIT 1
  `, [siteId, session.user.id])
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: PlatformBlogPostRequestBody
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    return jsonResponse(await updatePlatformBlogPost(db, postId, body, siteId))
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    if (statusCode >= 500) {
      console.error('Failed to update site blog post:', err)
      return jsonResponse({ error: 'Failed to update post' }, { status: statusCode })
    }
    const message = err instanceof Error ? err.message : 'Failed to update post'
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
