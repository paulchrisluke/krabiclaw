// Analytics utility functions for D1 aggregation
function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0)
}

function asRows(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? (value as ApiRecord[]) : []
}

export interface AnalyticsEvent {
  id: string
  site_id: string
  page_path: string
  session_id: string
  duration_seconds?: number
  created_at: string
}

export interface DailyAggregates {
  pageViews: number
  uniqueSessions: number
  avgSessionDuration: number
  uniqueVisitors: number
  pagesPerSession: number
  returningVisitors: number
  topPages: Array<{
    path: string
    views: number
    percentOfTotal: number
  }>
}

function dateRangeBounds(startDate: string, endDate: string) {
  const start = `${startDate}T00:00:00.000Z`

  const end = new Date(`${endDate}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 1)

  return {
    start,
    end: end.toISOString()
  }
}

/**
 * Aggregate pageview events for a specific date into daily summary
 * Queries raw events and updates site_analytics_daily
 */
export async function aggregateAnalyticsForDate(
  db: ApiValue,
  siteId: string,
  date: string
): Promise<void> {
  try {
    const { start, end } = dateRangeBounds(date, date)

    // Get raw pageview events for this date
    const events = await db.prepare(`
      SELECT 
        page_path,
        session_id,
        duration_seconds,
        COUNT(*) as page_view_count
      FROM site_pageview_events
      WHERE site_id = ?
        AND created_at >= ?
        AND created_at < ?
      GROUP BY session_id, page_path
    `).bind(siteId, start, end).all()

    // Calculate aggregates
    const eventRows = asRows((events as ApiRecord).results)
    const pageViewsTotal = eventRows.reduce((sum, row) => sum + toNumber(row.page_view_count || 1), 0)
    const uniqueSessions = new Set(eventRows.map((row) => String(row.session_id || ''))).size

    // Unique/returning visitors, derived from visitor_id (independent of session grouping above).
    const visitorRows = await db.prepare(`
      SELECT DISTINCT visitor_id
      FROM site_pageview_events
      WHERE site_id = ?
        AND created_at >= ?
        AND created_at < ?
        AND visitor_id IS NOT NULL
    `).bind(siteId, start, end).all()

    const visitorIds = asRows((visitorRows as ApiRecord).results).map((row) => String(row.visitor_id || ''))
    const uniqueVisitors = visitorIds.length

    let returningVisitors = 0
    if (visitorIds.length > 0) {
      const placeholders = visitorIds.map(() => '?').join(',')
      const returningResult = await db.prepare(`
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM site_pageview_events
        WHERE site_id = ?
          AND created_at < ?
          AND visitor_id IN (${placeholders})
      `).bind(siteId, start, ...visitorIds).first() as { count: number } | null
      returningVisitors = toNumber(returningResult?.count)
    }

    const pagesPerSession = uniqueSessions > 0
      ? Math.round((pageViewsTotal / uniqueSessions) * 100) / 100
      : 0

    // Calculate avg session duration
    const sessionDurations = await db.prepare(`
      SELECT 
        session_id,
        AVG(duration_seconds) as avg_duration
      FROM site_pageview_events
      WHERE site_id = ?
        AND created_at >= ?
        AND created_at < ?
      GROUP BY session_id
    `).bind(siteId, start, end).all()

    const durationRows = asRows((sessionDurations as ApiRecord).results)
      .filter((row) => row.avg_duration !== null && row.avg_duration !== undefined)
    const avgSessionDuration =
      durationRows.length > 0
        ? Math.round(durationRows.reduce((sum, row) => sum + toNumber(row.avg_duration), 0) / durationRows.length)
        : 0

    // Get top pages
    const topPagesResult = await db.prepare(`
      SELECT 
        page_path,
        COUNT(*) as views
      FROM site_pageview_events
      WHERE site_id = ?
        AND created_at >= ?
        AND created_at < ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    `).bind(siteId, start, end).all()

    const topPageRows = asRows((topPagesResult as ApiRecord).results)
    const topPages = topPageRows.map((row) => {
      const views = toNumber(row.views)
      return {
        path: String(row.page_path || '/'),
        views,
        percentOfTotal: pageViewsTotal > 0 ? Math.round((views / pageViewsTotal) * 100) : 0
      }
    })

    // Upsert into site_analytics_daily
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.prepare(`
      INSERT INTO site_analytics_daily (
        id, site_id, date, page_views, unique_sessions,
        avg_session_duration, top_pages, unique_visitors,
        pages_per_session, returning_visitors, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site_id, date) DO UPDATE SET
        page_views = excluded.page_views,
        unique_sessions = excluded.unique_sessions,
        avg_session_duration = excluded.avg_session_duration,
        top_pages = excluded.top_pages,
        unique_visitors = excluded.unique_visitors,
        pages_per_session = excluded.pages_per_session,
        returning_visitors = excluded.returning_visitors,
        updated_at = excluded.updated_at
    `).bind(
      id,
      siteId,
      date,
      pageViewsTotal,
      uniqueSessions,
      avgSessionDuration,
      JSON.stringify(topPages),
      uniqueVisitors,
      pagesPerSession,
      returningVisitors,
      now,
      now
    ).run()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error(`Failed to aggregate analytics for ${siteId} on ${date}:`, err.message)
    throw err
  }
}

/**
 * Aggregate analytics for all sites for a given date
 * Useful for scheduled cron jobs
 */
export async function aggregateAnalyticsForAllSites(db: ApiValue, date: string): Promise<void> {
  try {
    const { start, end } = dateRangeBounds(date, date)
    // Get all unique sites that have events on this date
    const sites = await db.prepare(`
      SELECT DISTINCT site_id
      FROM site_pageview_events
      WHERE created_at >= ?
        AND created_at < ?
    `).bind(start, end).all()

    const siteRows = asRows((sites as ApiRecord).results)
    console.log(`Aggregating analytics for ${siteRows.length} sites on ${date}`)

    for (const row of siteRows) {
      const rowSiteId = String(row.site_id || '')
      if (!rowSiteId) continue
      await aggregateAnalyticsForDate(db, rowSiteId, date)
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error(`Failed to aggregate analytics for all sites on ${date}:`, err.message)
    throw err
  }
}

/**
 * Clean up old pageview events (older than retention days)
 * Keeps daily aggregates intact
 */
export async function cleanupOldPageviewEvents(
  db: ApiValue,
  retentionDays: number = 90
): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

    const result = await db.prepare(`
      DELETE FROM site_pageview_events
      WHERE created_at < ?
    `).bind(cutoffDate).run()

    console.log(`Cleaned up ${result.meta.changes || 0} pageview events older than ${cutoffDate}`)
    return result.meta.changes || 0
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Failed to cleanup old pageview events:', err.message)
    throw err
  }
}

/**
 * Get analytics summary for a site across a date range
 */
export async function getAnalyticsSummary(
  db: ApiValue,
  siteId: string,
  startDate: string,
  endDate: string
): Promise<{
  pageViews: number
  uniqueSessions: number
  avgSessionDuration: number
}> {
  try {
    const dailyStats = await db.prepare(`
      SELECT 
        page_views,
        unique_sessions,
        avg_session_duration
      FROM site_analytics_daily
      WHERE site_id = ? AND date BETWEEN ? AND ?
    `).bind(siteId, startDate, endDate).all()

    const durationTotals = asRows((dailyStats as ApiRecord).results).reduce(
      (acc, row) => {
        const sessions = toNumber(row.unique_sessions)
        const averageDuration = toNumber(row.avg_session_duration)

        acc.weightedDuration += averageDuration * sessions
        acc.sessions += sessions
        acc.pageViews += toNumber(row.page_views)

        return acc
      },
      {
        weightedDuration: 0,
        sessions: 0,
        pageViews: 0
      }
    )

    return {
      pageViews: durationTotals.pageViews,
      uniqueSessions: durationTotals.sessions,
      avgSessionDuration: durationTotals.sessions > 0
        ? Math.round(durationTotals.weightedDuration / durationTotals.sessions)
        : 0
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('Failed to get analytics summary:', err.message)
    throw err
  }
}
