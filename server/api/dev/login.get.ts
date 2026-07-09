// Dev-only login bypass — creates a session without OAuth
// Throws 404 in production (import.meta.dev is false at build time)
import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { hasBetterAuthAdminRole } from '~/server/utils/platform-auth'
import { queryAll, queryFirst } from '~/server/db'

// Mirrors better-call's signCookieValue (HMAC-SHA256, base64(raw signature),
// `${value}.${signature}`) since better-auth only exposes signed-cookie
// helpers on an authenticated endpoint context, which this bypass route
// can't construct without already having the session it's trying to create.
// better-auth is pinned exactly in package.json — re-diff this against
// better-call's dist/crypto.mjs before any version bump.
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
    user = await queryFirst<{ id: string; email: string; role?: string | null }>(
      db, 'SELECT id, email, role FROM user WHERE id = ? LIMIT 1', [userId]
    )
    if (!user) {
      const email = `${userId}@example.test`
      try {
        // Goes through better-auth's internalAdapter, the same path real
        // signups/OAuth use — this fires databaseHooks.user.create.after
        // (server/utils/auth.ts), which creates the owner org/member row and
        // sends the admin-signup notification, so dev-login test users can't
        // silently drift from what a real signup produces.
        const created = await ctx.internalAdapter.createUser<{ id: string; email: string; role?: string | null }>({
          id: userId,
          name: userId,
          email,
          emailVerified: true,
          role: 'user',
        })
        user = { id: created.id, email: created.email, role: created.role }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/PRIMARY KEY|UNIQUE constraint failed/i.test(message)) {
          user = await queryFirst<{ id: string; email: string; role?: string | null }>(
            db, 'SELECT id, email, role FROM user WHERE id = ? LIMIT 1', [userId]
          )
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
    const results = await queryAll<{ id: string; email: string; role?: string | null; has_org: number; is_owner: number; has_site: number }>(db, `
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
    `)
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
