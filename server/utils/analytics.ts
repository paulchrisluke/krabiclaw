// Analytics utility functions for D1 aggregation
import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0)
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
  db: DbClient,
  siteId: string,
  date: string
): Promise<void> {
  try {
    const { start, end } = dateRangeBounds(date, date)

    // Get raw pageview events for this date
    const eventRows = await queryAll<{ page_path: string; session_id: string; duration_seconds: number | null; page_view_count: number }>(db, `
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
    `, [siteId, start, end])

    // Calculate aggregates
    const pageViewsTotal = eventRows.reduce((sum, row) => sum + toNumber(row.page_view_count || 1), 0)
    const uniqueSessions = new Set(eventRows.map((row) => String(row.session_id || ''))).size

    // Unique/returning visitors, derived from visitor_id (independent of session grouping above).
    const visitorRows = await queryAll<{ visitor_id: string }>(db, `
      SELECT DISTINCT visitor_id
      FROM site_pageview_events
      WHERE site_id = ?
        AND created_at >= ?
        AND created_at < ?
        AND visitor_id IS NOT NULL
    `, [siteId, start, end])

    const visitorIds = visitorRows.map((row) => String(row.visitor_id || ''))
    const uniqueVisitors = visitorIds.length

    let returningVisitors = 0
    if (visitorIds.length > 0) {
      const returningResult = await queryFirst<{ count: number }>(db, `
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM site_pageview_events
        WHERE site_id = ?
          AND created_at < ?
          AND visitor_id IN (
            SELECT DISTINCT visitor_id
            FROM site_pageview_events
            WHERE site_id = ?
              AND created_at >= ?
              AND created_at < ?
              AND visitor_id IS NOT NULL
          )
      `, [siteId, start, siteId, start, end])
      returningVisitors = toNumber(returningResult?.count)
    }

    const pagesPerSession = uniqueSessions > 0
      ? Math.round((pageViewsTotal / uniqueSessions) * 100) / 100
      : 0

    // Calculate avg session duration (average of each session's total duration, not of per-event averages)
    const sessionDurationRows = await queryAll<{ session_id: string; total_duration: number | null }>(db, `
      SELECT
        session_id,
        SUM(duration_seconds) as total_duration
      FROM site_pageview_events
      WHERE site_id = ?
        AND created_at >= ?
        AND created_at < ?
      GROUP BY session_id
    `, [siteId, start, end])

    const durationRows = sessionDurationRows
      .filter((row) => row.total_duration !== null && row.total_duration !== undefined)
    const avgSessionDuration =
      durationRows.length > 0
        ? Math.round(durationRows.reduce((sum, row) => sum + toNumber(row.total_duration), 0) / durationRows.length)
        : 0

    // Get top pages
    const topPageRows = await queryAll<{ page_path: string; views: number }>(db, `
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
    `, [siteId, start, end])

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

    await execute(db, `
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
    `, [
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
    ])
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error(`Failed to aggregate analytics for ${siteId} on ${date}:`, err.message)
    throw err
  }
}

export async function aggregateAnalyticsForRange(
  db: DbClient,
  siteId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const cursor = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)

  // Defensive check: reject overly wide ranges (max 365 days)
  const maxDays = 365
  const daySpan = Math.ceil((end.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24))
  if (daySpan > maxDays) {
    throw new Error(`Date range exceeds maximum of ${maxDays} days (requested: ${daySpan} days)`)
  }

  const today = new Date().toISOString().slice(0, 10)

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10)
    if (date) {
      // Skip re-aggregating days that already have a site_analytics_daily row,
      // unless the date is today (which may still have new events)
      const existingRow = await queryFirst<{ date: string }>(db, `
        SELECT date FROM site_analytics_daily
        WHERE site_id = ? AND date = ?
        LIMIT 1
      `, [siteId, date])

      if (!existingRow || date === today) {
        await aggregateAnalyticsForDate(db, siteId, date)
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
}

/**
 * Aggregate platform pageview events (krabiclaw.com itself: home, blog, docs,
 * marketing) for a specific date into platform_analytics_daily. Mirrors
 * aggregateAnalyticsForDate but is not site-scoped.
 */
export async function aggregatePlatformAnalyticsForDate(
  db: DbClient,
  date: string
): Promise<void> {
  try {
    const { start, end } = dateRangeBounds(date, date)

    const eventRows = await queryAll<{ page_path: string; session_id: string; duration_seconds: number | null; page_view_count: number }>(db, `
      SELECT
        page_path,
        session_id,
        duration_seconds,
        COUNT(*) as page_view_count
      FROM platform_pageview_events
      WHERE created_at >= ?
        AND created_at < ?
      GROUP BY session_id, page_path
    `, [start, end])

    const pageViewsTotal = eventRows.reduce((sum, row) => sum + toNumber(row.page_view_count || 1), 0)
    const uniqueSessions = new Set(eventRows.map((row) => String(row.session_id || ''))).size

    const visitorRows = await queryAll<{ visitor_id: string }>(db, `
      SELECT DISTINCT visitor_id
      FROM platform_pageview_events
      WHERE created_at >= ?
        AND created_at < ?
        AND visitor_id IS NOT NULL
    `, [start, end])

    const visitorIds = visitorRows.map((row) => String(row.visitor_id || ''))
    const uniqueVisitors = visitorIds.length

    let returningVisitors = 0
    if (visitorIds.length > 0) {
      const returningResult = await queryFirst<{ count: number }>(db, `
        SELECT COUNT(DISTINCT visitor_id) as count
        FROM platform_pageview_events
        WHERE created_at < ?
          AND visitor_id IN (
            SELECT DISTINCT visitor_id
            FROM platform_pageview_events
            WHERE created_at >= ?
              AND created_at < ?
              AND visitor_id IS NOT NULL
          )
      `, [start, start, end])
      returningVisitors = toNumber(returningResult?.count)
    }

    const pagesPerSession = uniqueSessions > 0
      ? Math.round((pageViewsTotal / uniqueSessions) * 100) / 100
      : 0

    const sessionDurationRows = await queryAll<{ session_id: string; total_duration: number | null }>(db, `
      SELECT
        session_id,
        SUM(duration_seconds) as total_duration
      FROM platform_pageview_events
      WHERE created_at >= ?
        AND created_at < ?
      GROUP BY session_id
    `, [start, end])

    const durationRows = sessionDurationRows
      .filter((row) => row.total_duration !== null && row.total_duration !== undefined)
    const avgSessionDuration =
      durationRows.length > 0
        ? Math.round(durationRows.reduce((sum, row) => sum + toNumber(row.total_duration), 0) / durationRows.length)
        : 0

    const topPageRows = await queryAll<{ page_path: string; views: number }>(db, `
      SELECT
        page_path,
        COUNT(*) as views
      FROM platform_pageview_events
      WHERE created_at >= ?
        AND created_at < ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    `, [start, end])

    const topPages = topPageRows.map((row) => {
      const views = toNumber(row.views)
      return {
        path: String(row.page_path || '/'),
        views,
        percentOfTotal: pageViewsTotal > 0 ? Math.round((views / pageViewsTotal) * 100) : 0
      }
    })

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await execute(db, `
      INSERT INTO platform_analytics_daily (
        id, date, page_views, unique_sessions,
        avg_session_duration, top_pages, unique_visitors,
        pages_per_session, returning_visitors, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        page_views = excluded.page_views,
        unique_sessions = excluded.unique_sessions,
        avg_session_duration = excluded.avg_session_duration,
        top_pages = excluded.top_pages,
        unique_visitors = excluded.unique_visitors,
        pages_per_session = excluded.pages_per_session,
        returning_visitors = excluded.returning_visitors,
        updated_at = excluded.updated_at
    `, [
      id,
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
    ])
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error(`Failed to aggregate platform analytics for ${date}:`, err.message)
    throw err
  }
}

/**
 * Get platform analytics summary (top pages + daily trend) across a date
 * range, for the platform admin dashboard/MCP tool to use in content planning.
 */
export async function getPlatformAnalyticsSummary(
  db: DbClient,
  startDate: string,
  endDate: string
): Promise<{
  pageViews: number
  uniqueSessions: number
  uniqueVisitors: number
  newSignups: number
  topPages: Array<{ path: string; views: number; percentOfTotal: number }>
  dailyData: Array<{ date: string; pageViews: number; sessions: number; newSignups: number }>
}> {
  const { start, end } = dateRangeBounds(startDate, endDate)
  // user.createdAt is stored as epoch seconds (Better Auth column), unlike the
  // ISO-text created_at on platform_pageview_events, so it needs its own bounds.
  const startEpochSeconds = Math.floor(new Date(start).getTime() / 1000)
  const endEpochSeconds = Math.floor(new Date(end).getTime() / 1000)

  // Derived from the same raw-event range as pageViews/uniqueSessions/topPages below,
  // rather than the platform_analytics_daily rollup table — that table is only
  // populated once a day via cron, so a day not yet aggregated would be missing
  // from dailyData while still being counted in the live totals.
  const [dailyStats, dailySignups] = await Promise.all([
    queryAll<{ date: string; page_views: number; unique_sessions: number }>(db, `
      SELECT
        substr(created_at, 1, 10) as date,
        COUNT(*) as page_views,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM platform_pageview_events
      WHERE created_at >= ? AND created_at < ?
      GROUP BY date
      ORDER BY date ASC
    `, [start, end]),
    queryAll<{ date: string; count: number }>(db, `
      SELECT
        strftime('%Y-%m-%d', createdAt, 'unixepoch') as date,
        COUNT(*) as count
      FROM user
      WHERE createdAt >= ? AND createdAt < ?
      GROUP BY date
      ORDER BY date ASC
    `, [startEpochSeconds, endEpochSeconds]),
  ])

  const [pageViewsResult, uniqueSessionsResult, visitorStats, newSignupsResult] = await Promise.all([
    queryFirst<{ count: number }>(db, `
      SELECT COUNT(*) as count
      FROM platform_pageview_events
      WHERE created_at >= ? AND created_at < ?
    `, [start, end]),
    queryFirst<{ count: number }>(db, `
      SELECT COUNT(DISTINCT session_id) as count
      FROM platform_pageview_events
      WHERE created_at >= ? AND created_at < ?
    `, [start, end]),
    queryFirst<{ count: number }>(db, `
      SELECT COUNT(DISTINCT visitor_id) as count
      FROM platform_pageview_events
      WHERE created_at >= ? AND created_at < ? AND visitor_id IS NOT NULL
    `, [start, end]),
    queryFirst<{ count: number }>(db, `
      SELECT COUNT(*) as count
      FROM user
      WHERE createdAt >= ? AND createdAt < ?
    `, [startEpochSeconds, endEpochSeconds]),
  ])

  const pageViews = toNumber(pageViewsResult?.count)
  const uniqueSessions = toNumber(uniqueSessionsResult?.count)

  // Re-derive top pages (and their total) from raw events across the full range
  // rather than merging each day's stored top-10 snapshot, which can miss pages
  // that only rank across the combined period and can't be trimmed back down to
  // a true top 10. The denominator for percentOfTotal must come from this same
  // raw-events query, not the `pageViews` rollup total above — they can diverge
  // (e.g. a day not yet aggregated) and produce a percentage over 100%.
  const [topPageRows, rawEventsTotal] = await Promise.all([
    queryAll<{ page_path: string; views: number }>(db, `
      SELECT
        page_path,
        COUNT(*) as views
      FROM platform_pageview_events
      WHERE created_at >= ? AND created_at < ?
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    `, [start, end]),
    queryFirst<{ count: number }>(db, `
      SELECT COUNT(*) as count
      FROM platform_pageview_events
      WHERE created_at >= ? AND created_at < ?
    `, [start, end]),
  ])

  const rawEventsTotalCount = toNumber(rawEventsTotal?.count)

  const topPages = topPageRows.map((row) => {
    const views = toNumber(row.views)
    return {
      path: String(row.page_path || '/'),
      views,
      percentOfTotal: rawEventsTotalCount > 0 ? Math.round((views / rawEventsTotalCount) * 100) : 0
    }
  })

  const signupsByDate = new Map(dailySignups.map(row => [String(row.date || ''), toNumber(row.count)]))

  const dailyData = dailyStats.map((row) => {
    const date = String(row.date || '')
    return {
      date,
      pageViews: toNumber(row.page_views),
      sessions: toNumber(row.unique_sessions),
      newSignups: signupsByDate.get(date) ?? 0
    }
  })

  // Include signup-only days that had zero platform pageviews (e.g. a direct
  // signup with no tracked page visit in this window) so newSignups totals
  // reconcile with the daily breakdown.
  for (const [date, count] of signupsByDate) {
    if (!dailyData.some(d => d.date === date)) {
      dailyData.push({ date, pageViews: 0, sessions: 0, newSignups: count })
    }
  }
  dailyData.sort((a, b) => a.date.localeCompare(b.date))

  return {
    pageViews,
    uniqueSessions,
    uniqueVisitors: toNumber(visitorStats?.count),
    newSignups: toNumber(newSignupsResult?.count),
    topPages,
    dailyData
  }
}

/**
 * Aggregate analytics for all sites for a given date
 * Useful for scheduled cron jobs
 */
export async function aggregateAnalyticsForAllSites(db: DbClient, date: string): Promise<void> {
  try {
    const { start, end } = dateRangeBounds(date, date)
    // Get all unique sites that have events on this date
    const siteRows = await queryAll<{ site_id: string }>(db, `
      SELECT DISTINCT site_id
      FROM site_pageview_events
      WHERE created_at >= ?
        AND created_at < ?
    `, [start, end])

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
  db: DbClient,
  retentionDays: number = 90
): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

    const result = await execute(db, `
      DELETE FROM site_pageview_events
      WHERE created_at < ?
    `, [cutoffDate])

    console.log(`Cleaned up ${result.meta?.changes || 0} pageview events older than ${cutoffDate}`)
    return result.meta?.changes || 0
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
  db: DbClient,
  siteId: string,
  startDate: string,
  endDate: string
): Promise<{
  pageViews: number
  uniqueSessions: number
  avgSessionDuration: number
}> {
  try {
    const dailyStats = await queryAll<{ page_views: number; unique_sessions: number; avg_session_duration: number }>(db, `
      SELECT
        page_views,
        unique_sessions,
        avg_session_duration
      FROM site_analytics_daily
      WHERE site_id = ? AND date BETWEEN ? AND ?
    `, [siteId, startDate, endDate])

    const durationTotals = dailyStats.reduce(
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
