// GET /api/admin/docs/[docId] - Fetch single platform doc (including draft)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin, anonymizeId } from '~/server/utils/platform-auth'
import { getPlatformDoc } from '~/server/utils/platform-content'

function auditLog(action: string, payload: ApiRecord) {
  console.info('[audit]', { action, timestamp: new Date().toISOString(), ...payload })
}

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId')
  if (!docId) return jsonResponse({ error: 'Doc ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformAdmin(session.user, env)) {
    auditLog('admin_read_denied', {
      user: anonymizeId(session.user.email, env),
      docId
    })
    return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })
  }

  try {
    const doc = await getPlatformDoc(db, docId)
    auditLog('admin_read_doc', {
      user: anonymizeId(session.user.email, env),
      docId,
      docSlug: doc.slug
    })
    return jsonResponse({ doc })
  } catch (err) {
    if (typeof (err as { statusCode?: unknown })?.statusCode === 'number' && Number((err as { statusCode: number }).statusCode) === 404) {
      auditLog('admin_read_not_found', {
        user: anonymizeId(session.user.email, env),
        docId
      })
      return jsonResponse({ error: 'Doc not found' }, { status: 404 })
    }
    console.error('Failed to fetch admin doc', { docId, error: err })
    return jsonResponse({ error: 'Failed to load doc' }, { status: 500 })
  }
})
