// GET /api/admin/platform/media - List platform media assets
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  const query = getQuery(event)
  const parsed = Number.parseInt(String(query.limit || '50'), 10)
  const limit = Math.min(Math.max(Number.isNaN(parsed) ? 50 : parsed, 1), 100)
  const id = Array.isArray(query.id) ? query.id[0] : (query.id as string | undefined)

  let sql = `SELECT id, public_url, thumbnail_url, alt_text FROM media_assets WHERE site_id = 'platform' AND status = 'active'`
  const params: ApiRecord[] = []

  if (id) {
    sql += ` AND id = ?`
    params.push(id)
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`
  params.push(limit)

  try {
    const { results } = await db.prepare(sql).bind(...params).all()
    return jsonResponse({ media: results ?? [] })
  } catch (err) {
    console.error('Failed to fetch platform media:', err)
    return jsonResponse({ error: 'Failed to load media' }, { status: 500 })
  }
})
