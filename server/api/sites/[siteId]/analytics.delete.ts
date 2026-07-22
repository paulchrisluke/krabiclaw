// DELETE /api/sites/[siteId]/analytics - Clear site-wide analytics data
import { jsonResponse } from '~/server/utils/api-response'
import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { execute } from '~/server/db'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const { db } = await requireSiteAccess(event, siteId)

  try {
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

    const eventResult = await execute(db, eventQuery, eventBinds)
    deletedEvents = eventResult.meta?.changes || 0

    // Delete daily aggregates (optionally filtered by date)
    let dailyQuery = `DELETE FROM site_analytics_daily WHERE site_id = ?`
    const dailyBinds: string[] = [siteId]

    if (before) {
      dailyQuery += ` AND date < ?`
      const [beforeDate] = before.split('T')
      dailyBinds.push(beforeDate || before) // Extract date part
    }

    const dailyResult = await execute(db, dailyQuery, dailyBinds)
    deletedDaily = dailyResult.meta?.changes || 0

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
