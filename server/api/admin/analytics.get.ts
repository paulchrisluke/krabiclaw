// GET /api/admin/analytics - Platform-wide analytics
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  if (!isPlatformOwner(session.user.email, env)) {
    return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  }

  try {
    const [totalUsers, totalOrganizations, totalSites, totalPosts, totalMenus, totalLocations] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as count FROM user`).first(),
      db.prepare(`SELECT COUNT(*) as count FROM organization`).first(),
      db.prepare(`SELECT COUNT(*) as count FROM sites`).first(),
      db.prepare(`SELECT COUNT(*) as count FROM posts`).first(),
      db.prepare(`SELECT COUNT(*) as count FROM menus`).first(),
      db.prepare(`SELECT COUNT(*) as count FROM business_locations`).first()
    ])

    const recentSites = await db.prepare(
      `SELECT id, brand_name, subdomain, created_at FROM sites ORDER BY created_at DESC LIMIT 10`
    ).all()

    return jsonResponse({
      metrics: {
        users: totalUsers?.count ?? 0,
        organizations: totalOrganizations?.count ?? 0,
        sites: totalSites?.count ?? 0,
        posts: totalPosts?.count ?? 0,
        menus: totalMenus?.count ?? 0,
        locations: totalLocations?.count ?? 0
      },
      recentSites: recentSites.results ?? []
    })
  } catch (err: any) {
    console.error('Failed to fetch analytics:', err?.stack || err)
    return jsonResponse({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
})
