// PATCH /api/admin/docs/[docId] - Update platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { updatePlatformDoc } from '~/server/utils/platform-content'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'

import type { PlatformDocRequestBody } from '~/server/types/platform-content'

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId')
  if (!docId) return jsonResponse({ error: 'Doc ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) return permissionDenied

  let body: PlatformDocRequestBody
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await updatePlatformDoc(db, docId, body)
    schedulePlatformKnowledgeIndexRebuild(event, env, 'doc update')
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to update doc'
    if (statusCode >= 500) console.error('Failed to update doc:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
