// GET /api/admin/docs/[docId] - Fetch single platform doc (including draft)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner, anonymizeId } from '~/server/utils/platform-auth'

function auditLog(action: string, payload: ApiRecord) {
  console.info('[audit]', { action, timestamp: new Date().toISOString(), ...payload })
}

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'docId')
  if (!docId) return jsonResponse({ error: 'Doc ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    auditLog('admin_read_denied', {
      user: anonymizeId(session.user.email, env),
      docId
    })
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  let doc: ApiRecord | null = null
  try {
    doc = await db.prepare(
      `SELECT id, title, slug, body, excerpt, category, seo_description, seo_keywords, difficulty_level, sort_order, parent_doc_id, featured_image_asset_id, status, published_at, created_at, updated_at FROM platform_docs WHERE id = ?`
    ).bind(docId).first() as ApiRecord | null
  } catch (err) {
    console.error('Failed to fetch admin doc', { docId, error: err })
    return jsonResponse({ error: 'Failed to load doc' }, { status: 500 })
  }

  if (!doc) {
    auditLog('admin_read_not_found', {
      user: anonymizeId(session.user.email, env),
      docId
    })
    return jsonResponse({ error: 'Doc not found' }, { status: 404 })
  }

  auditLog('admin_read_doc', {
    user: anonymizeId(session.user.email, env),
    docId,
    docSlug: doc.slug
  })

  return jsonResponse({ doc })
})
