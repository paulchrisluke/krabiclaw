// DELETE /api/admin/docs/[docId] - Delete platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { deletePlatformDoc } from '~/server/utils/platform-content'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'

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

  try {
    const result = await deletePlatformDoc(db, docId)
    schedulePlatformKnowledgeIndexRebuild(event, env, 'doc delete')
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to delete doc'
    if (statusCode >= 500) console.error('Failed to delete doc:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
