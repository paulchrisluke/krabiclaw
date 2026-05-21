// GET /api/sites/[siteId]/analytics - Owner-scoped analytics dashboard
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { defineEventHandler, getRouterParam, getQuery } from 'h3'

interface AnalyticsSummary {
  pageViews: number
  uniqueSessions: number
  avgSessionDuration: number
  changePercent: number
}

interface DailyData {
  date: string
  pageViews: number
  sessions: number
  avgDuration: number
}

interface TopPage {
  path: string
  views: number
  percentOfTotal: number
}

interface PeriodStats {
  pageViews: number
  sessions: number
  totalDuration: number
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0)
}

function normalizePath(value: unknown): string {
  const str = String(value || '').trim()
  return str || '/'
}

function parseDateParam(value: unknown, name: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be in YYYY-MM-DD format`)
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is not a valid date`)
  }

  return value
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')

  if (!siteId) {
    return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)

  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    // Verify user belongs to organization that owns the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id
      FROM sites s
      JOIN member m ON s.organization_id = m.organizationId
      WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first()

    if (!site) {
      return jsonResponse(
        { error: 'Site not found or access denied' },
        { status: 404 }
      )
    }

    const query = getQuery(event)
    const rawStartDate = (query.startDate as string) || getDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    const rawEndDate = (query.endDate as string) || getDateString(new Date())

    let startDate: string, endDate: string
    try {
      startDate = parseDateParam(rawStartDate, 'startDate')
      endDate = parseDateParam(rawEndDate, 'endDate')
      if (startDate > endDate) {
        throw new Error('startDate must be before or equal to endDate')
      }
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Invalid date' }, { status: 400 })
    }

    // Get aggregated daily analytics
    const dailyStats = await db.prepare(`
      SELECT 
        date,
        page_views,
        unique_sessions,
        COALESCE(avg_session_duration, 0) as avg_session_duration,
        top_pages
      FROM site_analytics_daily
      WHERE site_id = ? AND date BETWEEN ? AND ?
      ORDER BY date ASC
    `).bind(siteId, startDate, endDate).all()

    // Calculate summary metrics (current period)
    const currentPeriodStats = ((dailyStats.results || []) as ApiRecord[]).reduce<PeriodStats>(
      (acc, row) => {
        const rowPageViews = toNumber(row.page_views)
        const rowSessions = toNumber(row.unique_sessions)
        const rowAvgDuration = toNumber(row.avg_session_duration)
        return {
          pageViews: acc.pageViews + rowPageViews,
          sessions: acc.sessions + rowSessions,
          totalDuration: acc.totalDuration + (rowAvgDuration * rowSessions)
        }
      },
      { pageViews: 0, sessions: 0, totalDuration: 0 }
    )

    const avgDuration =
      currentPeriodStats.sessions > 0
        ? Math.round(currentPeriodStats.totalDuration / currentPeriodStats.sessions)
        : 0

    // Compare with previous period for change percent
    const startAt = new Date(startDate)
    const endAt = new Date(endDate)
    const periodDurationMs = endAt.getTime() - startAt.getTime()
    const prevStartDate = getDateString(new Date(startAt.getTime() - periodDurationMs - (24 * 60 * 60 * 1000)))
    const prevEndDate = getDateString(new Date(startAt.getTime() - (24 * 60 * 60 * 1000)))

    const prevPeriodStats = await db.prepare(`
      SELECT 
        SUM(page_views) as page_views,
        SUM(unique_sessions) as unique_sessions
      FROM site_analytics_daily
      WHERE site_id = ? AND date BETWEEN ? AND ?
    `).bind(siteId, prevStartDate, prevEndDate).first()

    const prevPageViews = toNumber((prevPeriodStats as ApiRecord | null)?.page_views)
    const changePercent = prevPageViews > 0 ? Math.round(((currentPeriodStats.pageViews - prevPageViews) / prevPageViews) * 100) : 0

    // Aggregate top pages across all daily rows.
    const topPageMap = new Map<string, number>()
    for (const row of ((dailyStats.results || []) as ApiRecord[])) {
      if (!row.top_pages) continue
      try {
        const parsed = JSON.parse(String(row.top_pages))
        if (!Array.isArray(parsed)) continue
        for (const page of parsed) {
          const pageRecord = page as ApiRecord
          const path = normalizePath(pageRecord.path || pageRecord.pagePath)
          const views = toNumber(pageRecord.views || pageRecord.count)
          if (views <= 0) continue
          topPageMap.set(path, (topPageMap.get(path) || 0) + views)
        }
      } catch {
        // Ignore malformed top_pages payloads.
      }
    }

    const totalPageViews = currentPeriodStats.pageViews
    const topPages: TopPage[] = Array.from(topPageMap.entries())
      .map(([path, views]) => ({
        path,
        views,
        percentOfTotal: totalPageViews > 0 ? Math.round((views / totalPageViews) * 100) : 0
      }))
      .sort((a, b) => b.views - a.views)

    // Format daily data for response
    const dailyData: DailyData[] = ((dailyStats.results || []) as ApiRecord[]).map((row) => ({
      date: String(row.date || ''),
      pageViews: toNumber(row.page_views),
      sessions: toNumber(row.unique_sessions),
      avgDuration: toNumber(row.avg_session_duration)
    }))

    const metrics: AnalyticsSummary = {
      pageViews: currentPeriodStats.pageViews,
      uniqueSessions: currentPeriodStats.sessions,
      avgSessionDuration: avgDuration,
      changePercent
    }

    return jsonResponse({
      metrics,
      dailyData,
      topPages,
      period: { startDate, endDate }
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Analytics fetch error:', err.message)
    return jsonResponse({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
})

function getDateString(date: Date): string {
  const [day] = date.toISOString().split('T')
  return day || ''
}
