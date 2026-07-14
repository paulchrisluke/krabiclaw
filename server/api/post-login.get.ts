// GET /api/post-login — server-side smart redirect after OAuth / sign-in.
// Reads the session role and routes: admin → /admin, owner → /dashboard/[slug].
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { queryFirst } from '~/server/db'
import { userHasLinkedCustomers } from '~/server/utils/guest-claims'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return sendRedirect(event, '/login')

  const user = session.user as typeof session.user & { role?: string }

  // Platform owners and admins always go to admin
  if (isPlatformAdmin(user, env)) {
    return sendRedirect(event, '/admin')
  }

  // Everyone else: resolve their org slug and go to dashboard
  if (!db) return sendRedirect(event, '/dashboard')

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
      const isGuest = await userHasLinkedCustomers(db, session.user.id)
      if (isGuest) {
        return sendRedirect(event, '/account')
      }
      return sendRedirect(event, '/dashboard/onboarding')
    }

    return sendRedirect(event, `/dashboard/${slug}`)
  } catch (error) {
    console.error('Failed to resolve organization slug in post-login:', error)
    return sendRedirect(event, '/dashboard')
  }
})
