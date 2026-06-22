// DELETE /api/admin/docs/[docId] - Delete platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { deletePlatformDoc } from '~/server/utils/platform-content'

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId')
  if (!docId) return jsonResponse({ error: 'Doc ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  try {
    return jsonResponse(await deletePlatformDoc(db, docId))
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to delete doc'
    if (statusCode >= 500) console.error('Failed to delete doc:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
