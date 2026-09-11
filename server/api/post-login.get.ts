import { HTTPError, defineHandler  } from 'nitro';

// GET /api/post-login — server-side redirect after OAuth / sign-in.
import { getQuery, redirect } from 'nitro/h3';
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { resolvePostLoginDestination } from '~/server/utils/post-login-routing'
import { NEW_SALE_PLAN_ID } from '~/shared/billing-model'
import { buildLoginUrl, buildPostLoginUrl, validatedInternalPath } from '~/shared/auth/return-target'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  const plan = getQuery(event).plan
  if (plan !== undefined && plan !== NEW_SALE_PLAN_ID) {
    throw new HTTPError({ statusCode: 400, message: 'Unknown checkout plan' })
  }
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return redirect(plan ? buildLoginUrl({ redirect: buildPostLoginUrl({ plan }) }) : '/login', 302)

  const redirectTarget = validatedInternalPath(getQuery(event).redirect)
  if (redirectTarget) return redirect(redirectTarget, 302)

  if (!db) {
    throw new HTTPError({ statusCode: 503, message: 'Database not available' })
  }

  try {
    const sessionRecord = session.session as typeof session.session & { activeOrganizationId?: string | null }
    const destination = await resolvePostLoginDestination(env, {
      userId: session.user.id,
      activeOrganizationId: typeof sessionRecord.activeOrganizationId === 'string' ? sessionRecord.activeOrganizationId : null,
    })
    if (plan) {
      if (destination === '/dashboard/onboarding') {
        throw new HTTPError({ statusCode: 409, message: 'An organization is required before choosing a billing plan' })
      }
      return redirect(`${destination}/settings/billing?plan=${encodeURIComponent(plan)}`, 302)
    }
    return redirect(destination, 302)
  } catch (error) {
    if (error instanceof HTTPError) throw error
    console.error('Failed to resolve organization slug in post-login:', error)
    throw new HTTPError({ statusCode: 500, message: 'Failed to resolve dashboard destination' })
  }
})
