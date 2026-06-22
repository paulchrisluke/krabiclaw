// POST /api/admin/invite/team — promote existing user to admin, or create new admin account
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const body = await readBody(event).catch(() => ({})) as { email?: string; name?: string }
  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  if (!email) return jsonResponse({ error: 'Email is required' }, { status: 400 })

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: 'Invalid email' }, { status: 400 })
  }

  const existing = await db.prepare(
    'SELECT id, email, role FROM user WHERE lower(email) = ? LIMIT 1'
  ).bind(email).first<{ id: string; email: string; role: string }>()

  if (existing) {
    if (existing.role === 'admin') {
      return jsonResponse({ error: 'This user is already an admin' }, { status: 409 })
    }
    await db.prepare('UPDATE user SET role = ? WHERE id = ?').bind('admin', existing.id).run()
    return jsonResponse({ success: true, action: 'promoted', email: existing.email })
  }

  // Create new user row directly — they'll link their Google/WhatsApp account on first sign-in
  const userId = crypto.randomUUID()
  const now = new Date().toISOString()
  const displayName = name || email.split('@')[0]!

  await db.prepare(`
    INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, 'admin', ?, ?)
  `).bind(userId, displayName, email, now, now).run()

  // Create their auto-org (matches the databaseHook that runs on OAuth signup)
  const orgId = `org-${userId}`
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)`)
      .bind(orgId, displayName, orgId, now),
    db.prepare(`INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'owner', ?)`)
      .bind(`member-${orgId}`, orgId, userId, now),
  ])

  return jsonResponse({ success: true, action: 'created', email })
})
