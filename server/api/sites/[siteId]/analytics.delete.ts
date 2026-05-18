// DELETE /api/sites/[siteId]/analytics - Clear analytics data (owner only)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { defineEventHandler, getRouterParam, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)

  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    // Verify user is owner/admin of the site's organization
    const site = await db.prepare(`
      SELECT s.id, s.organization_id
      FROM sites s
      JOIN member m ON s.organization_id = m.organizationId
      WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin')
      LIMIT 1
    `).bind(siteId, session.user.id).first()

    if (!site) {
      return jsonResponse(
        { error: 'Site not found or insufficient permissions' },
        { status: 404 }
      )
    }

    const query = getQuery(event)
    const before = query.before as string | undefined

    let deletedEvents = 0
    let deletedDaily = 0

    // Delete pageview events (optionally filtered by date)
    let eventQuery = `DELETE FROM site_pageview_events WHERE site_id = ?`
    const eventBinds: string[] = [siteId]

    if (before) {
      eventQuery += ` AND created_at < ?`
      eventBinds.push(before)
    }

    const eventResult = await db.prepare(eventQuery).bind(...eventBinds).run()
    deletedEvents = eventResult.meta.changes || 0

    // Delete daily aggregates (optionally filtered by date)
    let dailyQuery = `DELETE FROM site_analytics_daily WHERE site_id = ?`
    const dailyBinds: string[] = [siteId]

    if (before) {
      dailyQuery += ` AND date < ?`
      const [beforeDate] = before.split('T')
      dailyBinds.push(beforeDate || before) // Extract date part
    }

    const dailyResult = await db.prepare(dailyQuery).bind(...dailyBinds).run()
    deletedDaily = dailyResult.meta.changes || 0

    return jsonResponse({
      ok: true,
      deletedPageviewEvents: deletedEvents,
      deletedDailySummaries: deletedDaily,
      message: before
        ? `Cleared analytics before ${before}`
        : 'Cleared all analytics data'
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Analytics delete error:', err.message)
    return jsonResponse({ error: 'Failed to clear analytics' }, { status: 500 })
  }
})
