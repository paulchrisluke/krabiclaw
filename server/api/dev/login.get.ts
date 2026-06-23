// Dev-only login bypass — creates a session without OAuth
// Throws 404 in production (import.meta.dev is false at build time)
import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { hasBetterAuthAdminRole } from '~/server/utils/platform-auth'

async function hmacSign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

function validateDevUserId(rawUserId: unknown) {
  if (typeof rawUserId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'userId must be a string' })
  }

  const userId = rawUserId.trim()
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }
  if (userId.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'userId is too long' })
  }
  if (!/^[A-Za-z0-9._-]+$/.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'userId contains invalid characters' })
  }

  return userId
}

export default defineEventHandler(async (event) => {
  assertDevRouteAllowed(event)
  const query = getQuery(event)

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, statusMessage: 'No database' })

  const auth = createAuth(env)
  const ctx = await auth.$context

  const userId = query.userId !== undefined ? validateDevUserId(query.userId) : undefined

  let user: { id: string; email: string; role?: string | null } | null = null
  if (userId) {
    user = await db.prepare('SELECT id, email, role FROM user WHERE id = ? LIMIT 1').bind(userId).first() as {
      id: string
      email: string
      role?: string | null
    } | null
    if (!user) {
      const now = new Date().toISOString()
      const email = `${userId}@example.test`
      try {
        await db.prepare(`
          INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
          VALUES (?, ?, ?, 1, 'user', ?, ?)
        `).bind(userId, userId, email, now, now).run()
        // Mirrors the databaseHooks.user.create.after hook in auth.ts — real
        // signups always get an owner organization, but this raw insert
        // bypasses Better Auth (and its hooks) entirely.
        const orgId = `org-${userId}`
        await db.batch([
          db.prepare('INSERT OR IGNORE INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)')
            .bind(orgId, userId, orgId, now),
          db.prepare('INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)')
            .bind(`member-${orgId}`, orgId, userId, 'owner', now),
        ])
        user = { id: userId, email, role: 'user' }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/PRIMARY KEY|UNIQUE constraint failed/i.test(message)) {
          user = await db.prepare('SELECT id, email, role FROM user WHERE id = ? LIMIT 1').bind(userId).first() as {
            id: string
            email: string
            role?: string | null
          } | null
        } else {
          console.error(`Dev login user auto-create failed for ${userId}: ${message}`, error)
          throw createError({ statusCode: 500, statusMessage: 'Failed to create dev login user' })
        }
      }
      if (!user) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to load dev login user' })
      }
    }
  } else {
    const { results } = await db.prepare(`
      SELECT u.id, u.email, u.role,
             EXISTS(SELECT 1 FROM member m WHERE m.userId = u.id) AS has_org,
             EXISTS(SELECT 1 FROM member m WHERE m.userId = u.id AND m.role = 'owner') AS is_owner,
             EXISTS(
               SELECT 1
               FROM member m
               JOIN sites s ON s.organization_id = m.organizationId
               WHERE m.userId = u.id
             ) AS has_site
      FROM user u
      ORDER BY has_site DESC, is_owner DESC, has_org DESC, u.createdAt ASC
      LIMIT 50
    `).all<{ id: string; email: string; role?: string | null; has_org: number; is_owner: number; has_site: number }>()
    const rows = results || []
    
    user = rows.find((row) =>
      row.has_site === 1 &&
      row.is_owner === 1 &&
      row.has_org === 1 &&
      !hasBetterAuthAdminRole(row.role)
    ) || rows.find((row) =>
      row.is_owner === 1 &&
      row.has_org === 1 &&
      !hasBetterAuthAdminRole(row.role)
    ) || rows.find((row) =>
      row.has_org === 1 &&
      !hasBetterAuthAdminRole(row.role)
    ) || null
    if (!user) {
      throw createError({ statusCode: 500, statusMessage: 'No suitable dev user (prefer owner with site, fallback owner with org, fallback member with org)' })
    }
  }
  if (!user) throw createError({ statusCode: 500, statusMessage: 'No users in database' })

  const session = await ctx.internalAdapter.createSession(user.id)
  const signed = `${session.token}.${await hmacSign(session.token, ctx.secret)}`

  const cookieName = ctx.authCookies.sessionToken.name
  setCookie(event, cookieName, signed, {
    httpOnly: true,
    secure: cookieName.startsWith('__Secure-'),
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  })

  await sendRedirect(event, '/api/post-login')
})
