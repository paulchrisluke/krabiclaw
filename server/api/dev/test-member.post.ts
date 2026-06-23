import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'

type MemberRole = 'owner' | 'admin' | 'editor' | 'member'

export default defineEventHandler(async (event) => {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = getHeader(event, 'x-dev-route-secret') || ''
    if (!expectedSecret || !providedSecret || expectedSecret !== providedSecret) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
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
  const ownerMembership = await queryFirst<{ organizationId: string }>(db, `
    SELECT organizationId
    FROM member
    WHERE userId = ? AND role = 'owner' AND (? IS NULL OR organizationId = ?)
    ORDER BY createdAt ASC
    LIMIT 1
  `, [session.user.id, organizationId ?? null, organizationId ?? null])

  if (!ownerMembership?.organizationId) {
    return jsonResponse({ error: 'Owner organization not found' }, { status: 404 })
  }

  const now = Math.floor(Date.now() / 1000)
  const idSuffix = crypto.randomUUID()
  const userId = `e2e-user-${idSuffix}`
  const email = body.email?.trim().toLowerCase() || `e2e-${role}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`
  const name = body.name?.trim() || `E2E ${role}`

  await execute(db, `
    INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, 'user', ?, ?)
  `, [userId, name, email, now, now])

  await execute(db, `
    INSERT INTO member (id, organizationId, userId, role, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `, [`member-${idSuffix}`, ownerMembership.organizationId, userId, role, now])

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

