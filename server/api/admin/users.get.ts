import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { queryAll } from '~/server/db'

type UserQueryParam = string | number

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  banned: boolean | number | null
  createdAt: number
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const query = getQuery(event)
  const search = String(query.q || '').trim().toLowerCase()
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 50))
  const offset = Math.max(0, Number(query.offset) || 0)

  const where: string[] = []
  const params: UserQueryParam[] = []
  if (search) {
    const escapedSearch = search.replace(/([%_\\])/g, '\\$1')
    where.push("lower(email) LIKE ? ESCAPE '\\'")
    params.push(`%${escapedSearch}%`)
  }

  let users: UserRow[]
  try {
    users = await queryAll<UserRow>(db, `
      SELECT id, name, email, role, banned, createdAt
      FROM user
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset])
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown database error')
    console.error('admin_users_fetch_failed', {
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to fetch users' }, { status: 500 })
  }

  const normalized = users.map((user) => ({
    ...user,
    banned: Boolean(user.banned),
    createdAt: new Date(user.createdAt * 1000).toISOString()
  }))

  return jsonResponse({ users: normalized })
})