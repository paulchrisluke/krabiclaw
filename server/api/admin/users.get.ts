import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  const query = getQuery(event)
  const search = String(query.q || '').trim().toLowerCase()
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 50))
  const offset = Math.max(0, Number(query.offset) || 0)

  const where: string[] = []
  const params: any[] = []
  if (search) {
    const escapedSearch = search.replace(/([%_\\])/g, '\\$1')
    where.push("lower(email) LIKE ? ESCAPE '\\\\'")
    params.push(`%${escapedSearch}%`)
  }

  const users = await db.prepare(`
    SELECT id, name, email, role, banned, createdAt
    FROM user
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all()

  const normalized = (users.results || []).map((user: any) => ({
    ...user,
    banned: Boolean(user.banned)
  }))

  return jsonResponse({ users: normalized })
})