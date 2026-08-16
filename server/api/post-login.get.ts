import { HTTPError, defineHandler  } from 'nitro';

// GET /api/post-login — server-side redirect after OAuth / sign-in.
import { getQuery, redirect } from 'nitro/h3';
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { resolvePostLoginDestination } from '~/server/utils/post-login-routing'
import { validatedInternalPath } from '~/shared/auth/return-target'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return redirect('/login', 302)

  const redirectTarget = validatedInternalPath(getQuery(event).redirect)
  if (redirectTarget) return redirect(redirectTarget, 302)

  if (!db) {
    throw new HTTPError({ statusCode: 503, message: 'Database not available' })
  }

  try {
    const destination = await resolvePostLoginDestination(db, session.user)
    return redirect(destination, 302)
  } catch (error) {
    console.error('Failed to resolve organization slug in post-login:', error)
    throw new HTTPError({ statusCode: 500, message: 'Failed to resolve dashboard destination' })
  }
})
