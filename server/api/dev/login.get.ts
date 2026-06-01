// Dev-only login bypass — creates a session without OAuth
// Throws 404 in production (import.meta.dev is false at build time)
import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'

const textEncoder = new TextEncoder()

function timingSafeEqualText(a: string, b: string): boolean {
  const left = textEncoder.encode(a)
  const right = textEncoder.encode(b)
  if (left.length !== right.length) {
    // Dummy pass to keep roughly consistent execution when lengths differ.
    let noop = 0
    for (let i = 0; i < left.length; i += 1) noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!
  }
  return diff === 0
}

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

export default defineEventHandler(async (event) => {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  const allowDevRoute = devMode || e2eOverride
  if (!allowDevRoute) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const query = getQuery(event)

  // CI/E2E override must be explicitly authorized with a shared secret.
  if (!devMode && e2eOverride) {
    const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = getHeader(event, 'x-dev-route-secret') || String(query.secret || '')
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, statusMessage: 'No database' })

  const auth = createAuth(env)
  const ctx = await auth.$context

  const userId = query.userId as string | undefined

  const user = userId
    ? await db.prepare('SELECT id, email FROM user WHERE id = ? LIMIT 1').bind(userId).first() as { id: string; email: string } | null
    : await db.prepare('SELECT id, email FROM user LIMIT 1').first() as { id: string; email: string } | null
  if (!user) throw createError({ statusCode: 500, statusMessage: 'No users in database' })

  const session = await ctx.internalAdapter.createSession(user.id)
  const signed = `${session.token}.${await hmacSign(session.token, ctx.secret)}`

  const cookieName = ctx.authCookies.sessionToken.name
  setCookie(event, cookieName, signed, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  })

  await sendRedirect(event, '/api/post-login')
})
