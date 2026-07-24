// GET /api/post-login — server-side smart redirect after OAuth / sign-in.
// Reads the session role and routes: admin → /admin, owner → /dashboard/[slug].
import { getQuery } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { resolvePostLoginDestination } from '~/server/utils/post-login-routing'
import { validatedInternalPath } from '~/shared/auth/return-target'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return sendRedirect(event, '/login')

  const redirect = validatedInternalPath(getQuery(event).redirect)
  if (redirect) return sendRedirect(event, redirect)

  if (!db) {
    throw createError({ statusCode: 503, message: 'Database not available' })
  }

  try {
    const destination = await resolvePostLoginDestination(
      db,
      session.user,
      session.session as typeof session.session & { impersonatedBy?: string | null },
      {
        isPlatformAdmin: await hasPlatformEventPermission(event, env, { platform: ['access'] }),
      },
    )
    return sendRedirect(event, destination)
  } catch (error) {
    console.error('Failed to resolve organization slug in post-login:', error)
    throw createError({ statusCode: 500, message: 'Failed to resolve dashboard destination' })
  }
})
