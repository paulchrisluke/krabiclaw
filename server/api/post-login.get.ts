// GET /api/post-login — server-side smart redirect after OAuth / sign-in.
// Reads the session role and routes: admin → /admin, owner → /dashboard/[slug].
import { getQuery } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { queryFirst } from '~/server/db'
import { userHasLinkedCustomers } from '~/server/utils/guest-claims'
import { validatedInternalPath } from '~/shared/auth/return-target'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return sendRedirect(event, '/login')

  const redirect = validatedInternalPath(getQuery(event).redirect)
  if (redirect) return sendRedirect(event, redirect)

  // Platform owners and admins always go to admin
  if (await hasPlatformEventPermission(event, env, { platform: ['access'] })) {
    return sendRedirect(event, '/admin')
  }

  // Everyone else: resolve their org slug and go to dashboard
  if (!db) {
    throw createError({ statusCode: 503, message: 'Database not available' })
  }

  try {
    const row = await queryFirst<{ slug: string | null }>(db, `
      SELECT o.slug
      FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY o.createdAt ASC
      LIMIT 1
    `, [session.user.id])

    const slug = row?.slug

    if (!slug) {
      // No organization membership. This session may be a guest/end-customer
      // (see docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md)
      // rather than a brand-new tenant operator — check for linked customers
      // rows before defaulting to tenant onboarding. A genuinely new signup has
      // none of these, so its onboarding redirect is unchanged.
      const isGuest = await userHasLinkedCustomers(db, session.user.id).catch(() => false)
      if (isGuest) {
        return sendRedirect(event, '/account')
      }
      return sendRedirect(event, '/dashboard/onboarding')
    }

    return sendRedirect(event, `/dashboard/${slug}`)
  } catch (error) {
    console.error('Failed to resolve organization slug in post-login:', error)
    throw createError({ statusCode: 500, message: 'Failed to resolve dashboard destination' })
  }
})
