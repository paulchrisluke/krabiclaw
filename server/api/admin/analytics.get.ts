// GET /api/admin/analytics - Platform-wide analytics
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll, queryFirst } from '~/server/db'
import { adminHeadersForEvent, authAdminApi, countPlatformUsers, platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['analytics'] })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error)
    return jsonResponse({ error: message }, { status: statusCode })
  }

  try {
    const [totalUsers, totalOrganizations, totalSites, totalPosts, totalMenus, totalLocations] = await Promise.all([
      countPlatformUsers(authAdminApi(env), adminHeadersForEvent(event)),
      queryFirst<{ count: number }>(db, `SELECT COUNT(*) as count FROM organization`),
      queryFirst<{ count: number }>(db, `SELECT COUNT(*) as count FROM sites`),
      queryFirst<{ count: number }>(db, `SELECT COUNT(*) as count FROM posts`),
      queryFirst<{ count: number }>(db, `SELECT COUNT(*) as count FROM menus`),
      queryFirst<{ count: number }>(db, `SELECT COUNT(*) as count FROM business_locations`),
    ])

    const recentSites = await queryAll<{ id: string; brand_name: string | null; subdomain: string; created_at: string }>(
      db,
      `SELECT id, brand_name, subdomain, created_at FROM sites ORDER BY created_at DESC LIMIT 10`,
    )

    return jsonResponse({
      metrics: {
        users: totalUsers,
        organizations: totalOrganizations?.count ?? 0,
        sites: totalSites?.count ?? 0,
        posts: totalPosts?.count ?? 0,
        menus: totalMenus?.count ?? 0,
        locations: totalLocations?.count ?? 0
      },
      recentSites: recentSites ?? []
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to fetch analytics:', error.stack || error.message)
    return jsonResponse({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
})
