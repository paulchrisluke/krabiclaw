import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const dashboard = await getDashboardContext(event, { requireSite: false })
  if (!dashboard?.site) return jsonResponse({ error: 'Site not found' }, { status: 404 })

  try {
    const now = new Date().toISOString()
    await execute(db, `
      UPDATE sites
      SET onboarding_status = 'completed', updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [now, dashboard.site.id, dashboard.site.organization_id])

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('Failed to complete onboarding:', err)
    return jsonResponse({ error: 'Failed to complete onboarding' }, { status: 500 })
  }
})
