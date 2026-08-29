import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { PLATFORM_SITE_ID } from '~/shared/platform-scope'

const n = (value: unknown) => Number(value || 0)

function utcBounds(startDate: string, endDate: string) {
  const end = new Date(`${endDate}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start: `${startDate}T00:00:00.000Z`, end: end.toISOString() }
}

export const PLATFORM_SIGNUP_LEDGER_START_DATE = '2026-07-26'

export async function getPlatformAnalyticsSummary(db: DbClient, startDate: string, endDate: string) {
  const { start, end } = utcBounds(startDate, endDate)
  const [daily, totals, topPages, signups, dailySignups] = await Promise.all([
    queryAll<Record<string, unknown>>(db, `SELECT substr(created_at, 1, 10) date, COUNT(*) page_views,
      COUNT(DISTINCT session_id) unique_sessions FROM site_pageview_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY 1 ORDER BY 1`, [PLATFORM_SITE_ID, start, end]),
    queryFirst<Record<string, unknown>>(db, `SELECT COUNT(*) page_views, COUNT(DISTINCT session_id) sessions,
      COUNT(DISTINCT visitor_id) visitors FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?`, [PLATFORM_SITE_ID, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT page_path, COUNT(*) views FROM site_pageview_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY page_path ORDER BY views DESC LIMIT 10`, [PLATFORM_SITE_ID, start, end]),
    queryFirst<{ count: number }>(db, `SELECT COUNT(*) count FROM notifications WHERE scope = 'platform'
      AND event_type = 'platform.user_signup' AND created_at >= ? AND created_at < ?`, [start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT substr(created_at, 1, 10) date, COUNT(*) count FROM notifications
      WHERE scope = 'platform' AND event_type = 'platform.user_signup' AND created_at >= ? AND created_at < ? GROUP BY 1`, [start, end]),
  ])
  const pageViews = n(totals?.page_views)
  const signupByDate = new Map(dailySignups.map(row => [String(row.date), n(row.count)]))
  const dailyData = daily.map(row => ({
    date: String(row.date), pageViews: n(row.page_views), sessions: n(row.unique_sessions), newSignups: signupByDate.get(String(row.date)) ?? 0,
  }))
  for (const [date, count] of signupByDate) if (!dailyData.some(row => row.date === date)) dailyData.push({ date, pageViews: 0, sessions: 0, newSignups: count })
  dailyData.sort((a, b) => a.date.localeCompare(b.date))
  return {
    pageViews,
    uniqueSessions: n(totals?.sessions),
    uniqueVisitors: n(totals?.visitors),
    newSignups: n(signups?.count),
    newSignupsLedgerStartDate: PLATFORM_SIGNUP_LEDGER_START_DATE,
    topPages: topPages.map(row => ({ path: String(row.page_path || '/'), views: n(row.views), percentOfTotal: pageViews ? Math.round(n(row.views) / pageViews * 100) : 0 })),
    dailyData,
  }
}
