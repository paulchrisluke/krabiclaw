import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const dashboard = await getDashboardContext(event, { requireRestaurant: false })
  if (!dashboard?.restaurant) return jsonResponse({ error: 'Restaurant not found' }, { status: 404 })

  try {
    const now = new Date().toISOString()
    await db.prepare(`
      UPDATE sites
      SET onboarding_status = 'completed', updated_at = ?
      WHERE id = ? AND organization_id = ?
    `).bind(now, dashboard.restaurant.id, dashboard.restaurant.organization_id).run()

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('Failed to complete onboarding:', err)
    return jsonResponse({ error: 'Failed to complete onboarding' }, { status: 500 })
  }
})
