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

  // Platform owners always go to admin
  if (isPlatformOwner(session.user.email, env)) {
    return sendRedirect(event, '/admin')
  }

  // Everyone else: resolve their org slug and go to dashboard
  if (!db) return sendRedirect(event, '/dashboard')

  const row = await db.prepare(`
    SELECT o.slug
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    WHERE m.userId = ?
    ORDER BY o.createdAt ASC
    LIMIT 1
  `).bind(session.user.id).first<{ slug: string | null }>()

  const slug = row?.slug
  return sendRedirect(event, slug ? `/dashboard/${slug}` : '/dashboard/account/settings')
})
