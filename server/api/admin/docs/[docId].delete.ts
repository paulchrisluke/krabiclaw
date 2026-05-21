// DELETE /api/admin/docs/[docId] - Delete platform doc
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId')
  if (!docId) return jsonResponse({ error: 'Doc ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  try {
    const result = await db.prepare(`DELETE FROM platform_docs WHERE id = ?`).bind(docId).run()
    if (!result.meta.changes || result.meta.changes === 0) {
      return jsonResponse({ error: 'Doc not found' }, { status: 404 })
    }
  } catch (err) {
    console.error('Failed to delete doc:', err)
    return jsonResponse({ error: 'Failed to delete doc' }, { status: 500 })
  }

  return jsonResponse({ success: true })
})
