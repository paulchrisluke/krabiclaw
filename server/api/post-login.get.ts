// GET /api/post-login — server-side smart redirect after OAuth / sign-in.
// Reads the session role and routes: admin → /admin, owner → /dashboard/[slug].
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return sendRedirect(event, '/login')

  const user = session.user as typeof session.user & { role?: string }

  // Platform owners and admins always go to admin
  if (user.role === 'admin' || (typeof user.email === 'string' && user.email.trim() !== '' && isPlatformOwner(user.email, env))) {
    return sendRedirect(event, '/admin')
  }

  // Everyone else: resolve their org slug and go to dashboard
  if (!db) return sendRedirect(event, '/dashboard')

  try {
    const row = await db.prepare(`
      SELECT o.slug
      FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      ORDER BY o.createdAt ASC
      LIMIT 1
    `).bind(session.user.id).first<{ slug: string | null }>()

    const slug = row?.slug

    // If no org, send to onboarding to create org + site
    if (!slug) {
      return sendRedirect(event, '/dashboard/onboarding')
    }

    return sendRedirect(event, `/dashboard/${slug}`)
  } catch (error) {
    console.error('Failed to resolve organization slug in post-login:', error)
    return sendRedirect(event, '/dashboard')
  }
})
