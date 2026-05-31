import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

type MemberRole = 'owner' | 'admin' | 'editor' | 'member'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = (await readBody(event).catch(() => ({}))) as {
    role?: string
    organizationId?: string
    email?: string
    name?: string
  }

  const role = body.role as MemberRole
  if (!role || !['owner', 'admin', 'editor', 'member'].includes(role)) {
    return jsonResponse({ error: 'Invalid role' }, { status: 400 })
  }

  const organizationId = body.organizationId
  const ownerMembership = await db.prepare(`
    SELECT organizationId
    FROM member
    WHERE userId = ? AND role = 'owner' AND (? IS NULL OR organizationId = ?)
    ORDER BY createdAt ASC
    LIMIT 1
  `).bind(session.user.id, organizationId ?? null, organizationId ?? null).first<{ organizationId: string }>()

  if (!ownerMembership?.organizationId) {
    return jsonResponse({ error: 'Owner organization not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const idSuffix = crypto.randomUUID()
  const userId = `e2e-user-${idSuffix}`
  const email = body.email?.trim().toLowerCase() || `e2e-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`
  const name = body.name?.trim() || `E2E ${role}`

  await db.prepare(`
    INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, 'user', ?, ?)
  `).bind(userId, name, email, now, now).run()

  await db.prepare(`
    INSERT INTO member (id, organizationId, userId, role, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).bind(`member-${idSuffix}`, ownerMembership.organizationId, userId, role, now).run()

  return jsonResponse({
    success: true,
    user: {
      id: userId,
      email,
      name,
      role,
      organizationId: ownerMembership.organizationId,
    },
  })
})

