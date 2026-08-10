// Dev-only login bypass — creates a session without OAuth
// Throws 404 in production (import.meta.dev is false at build time)
import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { assertDevRouteAllowed } from '~/server/utils/dev-route-auth'
import { queryFirst } from '~/server/db'
import { getOrgAdapter } from 'better-auth/plugins'
import { selectDevLoginUser } from '~/server/utils/dev-login-selection'

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
  const organizationAdapter = getOrgAdapter(ctx as Parameters<typeof getOrgAdapter>[0], {})

  const userId = query.userId !== undefined ? validateDevUserId(query.userId) : undefined

  let user: { id: string; email: string; role?: string | null } | null = null
  if (userId) {
    const existing = await ctx.internalAdapter.findUserById(userId)
    user = existing ? {
      id: existing.id,
      email: existing.email,
      role: (existing as typeof existing & { role?: string | null }).role,
    } : null
    if (!user) {
      const email = `${userId}@example.test`
      try {
        // Goes through better-auth's internalAdapter, the same path real
        // signups/OAuth use — this fires databaseHooks.user.create.after
        // (server/utils/auth.ts) and sends the signup notification, so dev-login
        // test users can't silently drift from what a real signup produces.
        const created = await ctx.internalAdapter.createUser<{ id: string; email: string; role?: string | null }>(
          {
            id: userId,
            name: userId,
            email,
            emailVerified: true,
            role: 'user',
          },
          { method: 'test' },
        )
        user = { id: created.id, email: created.email, role: created.role }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/PRIMARY KEY|UNIQUE constraint failed/i.test(message)) {
          const raced = await ctx.internalAdapter.findUserById(userId)
          user = raced ? {
            id: raced.id,
            email: raced.email,
            role: (raced as typeof raced & { role?: string | null }).role,
          } : null
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
    const selected = await selectDevLoginUser({
      internalAdapter: ctx.internalAdapter,
      organizationAdapter,
      hasSite: async (organizationIds) => organizationIds.length > 0
        && Boolean(await queryFirst<{ id: string }>(
          db,
          `SELECT id FROM sites WHERE organization_id IN (${organizationIds.map(() => '?').join(', ')}) LIMIT 1`,
          organizationIds,
        )),
    })

    user = selected
      ? {
        id: selected.id,
        email: selected.email,
        role: (selected as typeof selected & { role?: string | null }).role,
      }
      : null
    if (!user) {
      throw createError({ statusCode: 500, statusMessage: 'No suitable dev user' })
    }
  }
  if (!user) throw createError({ statusCode: 500, statusMessage: 'No users in database' })

  const organizations = (await organizationAdapter.listOrganizations(user.id))
    .slice()
    .sort((left, right) => timestampValue(left.createdAt) - timestampValue(right.createdAt))
  const session = await ctx.internalAdapter.createSession(
    user.id,
    undefined,
    organizations[0] ? { activeOrganizationId: organizations[0].id } : undefined,
  )
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

function timestampValue(value: Date | string | number): number {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}
