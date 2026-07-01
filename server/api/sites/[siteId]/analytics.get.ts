// GET /api/sites/[siteId]/analytics - Owner-scoped analytics dashboard
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { queryAll, queryFirst } from '~/server/db'
import { aggregateAnalyticsForDate, aggregateAnalyticsForRange } from '~/server/utils/analytics'

interface AnalyticsSummary {
  pageViews: number
  uniqueSessions: number
  avgSessionDuration: number
  changePercent: number
  reservations: number
  experienceBookings: number
  uniqueVisitors: number
  pagesPerSession: number
  returningVisitors: number
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

interface CountryBreakdown {
  country: string
  countryCode: string
  views: number
  visitors: number
  percentOfTotal: number
}

interface CityBreakdown {
  city: string
  region: string | null
  countryCode: string
  views: number
}

interface ReferrerBreakdown {
  source: string
  views: number
  percentOfTotal: number
}

interface DeviceBreakdown {
  type: 'Mobile' | 'Desktop' | 'Tablet' | 'Bot' | 'Unknown'
  views: number
  percentOfTotal: number
}

interface PeriodStats {
  pageViews: number
  sessions: number
  totalDuration: number
  uniqueVisitors: number
  returningVisitors: number
}

interface DailyAnalyticsRow {
  date: string
  page_views: number
  unique_sessions: number
  avg_session_duration: number
  top_pages: string | null
  unique_visitors: number
  returning_visitors: number
}

interface PeriodTotalsRow {
  page_views: number | null
  unique_sessions: number | null
}

interface SiteAccessRow {
  id: string
  organization_id: string
  subdomain: string | null
}

interface TopPageJson {
  path?: string
  pagePath?: string
  views?: number
  count?: number
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0)
}

function normalizePath(value: unknown): string {
  const str = String(value || '').trim()
  return str || '/'
}

function normalizeCountryCode(value: unknown): string {
  const code = String(value || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : 'XX'
}

function normalizeReferrer(value: unknown, siteSubdomain: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return 'Direct'

  try {
    const url = new URL(raw)
    const host = url.hostname.replace(/^www\./, '')
    const freeHost = siteSubdomain ? `${siteSubdomain}.krabiclaw.com` : ''
    if (siteSubdomain && (host === freeHost || host === `${siteSubdomain}.localhost`)) return 'Internal'
    return host || 'Direct'
  } catch {
    return 'Direct'
  }
}

function classifyDevice(userAgent: unknown): DeviceBreakdown['type'] {
  const ua = String(userAgent || '').toLowerCase()
  if (!ua) return 'Unknown'
  if (/bot|crawler|spider|crawling|preview|slurp/.test(ua)) return 'Bot'
  if (/ipad|tablet|kindle|silk/.test(ua)) return 'Tablet'
  if (/mobile|iphone|ipod|android.*mobile|windows phone/.test(ua)) return 'Mobile'
  return 'Desktop'
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
    const site = await queryFirst<SiteAccessRow>(db, `
      SELECT s.id, s.organization_id, s.subdomain
      FROM sites s
      JOIN member m ON s.organization_id = m.organizationId
      WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `, [siteId, session.user.id])

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

    // Backfill the requested range from raw events so tenant analytics can heal
    // from an empty/partial daily rollup table without waiting for cron.
    await aggregateAnalyticsForRange(db, siteId, startDate, endDate)

    // Opportunistically aggregate today's stats so the dashboard is up-to-date
    const today = getDateString(new Date())
    if (endDate >= today || startDate <= today) {
      try {
        await aggregateAnalyticsForDate(db, siteId, today)
      } catch (e) {
        console.warn('Opportunistic analytics aggregation failed:', e)
      }
    }

    // Get aggregated daily analytics
    const dailyStats = await queryAll<DailyAnalyticsRow>(db, `
      SELECT
        date,
        page_views,
        unique_sessions,
        COALESCE(avg_session_duration, 0) as avg_session_duration,
        top_pages,
        COALESCE(unique_visitors, 0) as unique_visitors,
        COALESCE(returning_visitors, 0) as returning_visitors
      FROM site_analytics_daily
      WHERE site_id = ? AND date BETWEEN ? AND ?
      ORDER BY date ASC
    `, [siteId, startDate, endDate])

    // Calculate summary metrics (current period)
    const currentPeriodStats = (dailyStats || []).reduce<PeriodStats>(
      (acc, row) => {
        const rowPageViews = toNumber(row.page_views)
        const rowSessions = toNumber(row.unique_sessions)
        const rowAvgDuration = toNumber(row.avg_session_duration)
        return {
          pageViews: acc.pageViews + rowPageViews,
          sessions: acc.sessions + rowSessions,
          totalDuration: acc.totalDuration + (rowAvgDuration * rowSessions),
          uniqueVisitors: 0, // Calculated accurately below
          returningVisitors: 0 // Calculated accurately below
        }
      },
      { pageViews: 0, sessions: 0, totalDuration: 0, uniqueVisitors: 0, returningVisitors: 0 }
    )

    // Accurate visitor deduplication across the date range
    const startIso = `${startDate}T00:00:00.000Z`
    const endDateObj = new Date(`${endDate}T00:00:00.000Z`)
    endDateObj.setUTCDate(endDateObj.getUTCDate() + 1)
    const endIso = endDateObj.toISOString()

    const visitorStats = await queryFirst<{ unique_visitors: number; returning_visitors: number }>(db, `
      SELECT
        COUNT(DISTINCT visitor_id) as unique_visitors,
        (
          SELECT COUNT(DISTINCT visitor_id)
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
        ) as returning_visitors
      FROM site_pageview_events
      WHERE site_id = ?
        AND created_at >= ?
        AND created_at < ?
        AND visitor_id IS NOT NULL
    `, [
      siteId, startIso,
      siteId, startIso, endIso,
      siteId, startIso, endIso
    ])

    currentPeriodStats.uniqueVisitors = toNumber(visitorStats?.unique_visitors)
    currentPeriodStats.returningVisitors = toNumber(visitorStats?.returning_visitors)

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

    const prevPeriodStats = await queryFirst<PeriodTotalsRow>(db, `
      SELECT
        SUM(page_views) as page_views,
        SUM(unique_sessions) as unique_sessions
      FROM site_analytics_daily
      WHERE site_id = ? AND date BETWEEN ? AND ?
    `, [siteId, prevStartDate, prevEndDate])

    const prevPageViews = toNumber(prevPeriodStats?.page_views)
    const changePercent = prevPageViews > 0 ? Math.round(((currentPeriodStats.pageViews - prevPageViews) / prevPageViews) * 100) : 0

    // Aggregate top pages across all daily rows.
    const topPageMap = new Map<string, number>()
    for (const row of (dailyStats || [])) {
      if (!row.top_pages) continue
      try {
        const parsed = JSON.parse(String(row.top_pages))
        if (!Array.isArray(parsed)) continue
        for (const page of parsed as TopPageJson[]) {
          const path = normalizePath(page.path || page.pagePath)
          const views = toNumber(page.views || page.count)
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
      .slice(0, 10)

    const countryRows = await queryAll<{ country: string | null; views: number; visitors: number }>(db, `
      SELECT
        COALESCE(NULLIF(country, ''), 'XX') as country,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_id) as visitors
      FROM site_pageview_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ?
      GROUP BY COALESCE(NULLIF(country, ''), 'XX')
      ORDER BY views DESC
    `, [siteId, startIso, endIso])

    const countryMap = new Map<string, { views: number; visitors: number }>()
    for (const row of countryRows) {
      const code = normalizeCountryCode(row.country)
      const existing = countryMap.get(code) || { views: 0, visitors: 0 }
      countryMap.set(code, {
        views: existing.views + toNumber(row.views),
        visitors: existing.visitors + toNumber(row.visitors)
      })
    }
    const countries: CountryBreakdown[] = Array.from(countryMap.entries())
      .map(([code, { views, visitors }]) => ({
        country: code,
        countryCode: code,
        views,
        visitors,
        percentOfTotal: totalPageViews > 0 ? Math.round((views / totalPageViews) * 100) : 0
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 12)

    const cities = (await queryAll<{ city: string | null; region: string | null; country: string | null; views: number }>(db, `
      SELECT
        COALESCE(NULLIF(city, ''), 'Unknown') as city,
        NULLIF(region, '') as region,
        COALESCE(NULLIF(country, ''), 'XX') as country,
        COUNT(*) as views
      FROM site_pageview_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ?
      GROUP BY COALESCE(NULLIF(city, ''), 'Unknown'), NULLIF(region, ''), COALESCE(NULLIF(country, ''), 'XX')
      ORDER BY views DESC
      LIMIT 10
    `, [siteId, startIso, endIso])).map(row => ({
      city: String(row.city || 'Unknown'),
      region: row.region,
      countryCode: normalizeCountryCode(row.country),
      views: toNumber(row.views)
    } satisfies CityBreakdown))

    const referrerMap = new Map<string, number>()
    const referrerRows = await queryAll<{ referrer: string | null; views: number }>(db, `
      SELECT referrer, COUNT(*) as views
      FROM site_pageview_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ?
      GROUP BY referrer
      ORDER BY views DESC
      LIMIT 200
    `, [siteId, startIso, endIso])
    for (const row of referrerRows) {
      const source = normalizeReferrer(row.referrer, site.subdomain)
      referrerMap.set(source, (referrerMap.get(source) || 0) + toNumber(row.views))
    }
    const referrers: ReferrerBreakdown[] = Array.from(referrerMap.entries())
      .map(([source, views]) => ({
        source,
        views,
        percentOfTotal: totalPageViews > 0 ? Math.round((views / totalPageViews) * 100) : 0
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10)

    const deviceMap = new Map<DeviceBreakdown['type'], number>()
    const deviceRows = await queryAll<{ user_agent: string | null; views: number }>(db, `
      SELECT user_agent, COUNT(*) as views
      FROM site_pageview_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ?
      GROUP BY user_agent
      ORDER BY views DESC
      LIMIT 500
    `, [siteId, startIso, endIso])
    for (const row of deviceRows) {
      const type = classifyDevice(row.user_agent)
      deviceMap.set(type, (deviceMap.get(type) || 0) + toNumber(row.views))
    }
    const devices: DeviceBreakdown[] = Array.from(deviceMap.entries())
      .map(([type, views]) => ({
        type,
        views,
        percentOfTotal: totalPageViews > 0 ? Math.round((views / totalPageViews) * 100) : 0
      }))
      .sort((a, b) => b.views - a.views)

    // Format daily data for response
    const dailyData: DailyData[] = (dailyStats || []).map((row) => ({
      date: String(row.date || ''),
      pageViews: toNumber(row.page_views),
      sessions: toNumber(row.unique_sessions),
      avgDuration: toNumber(row.avg_session_duration)
    }))

    const metrics: AnalyticsSummary = {
      pageViews: currentPeriodStats.pageViews,
      uniqueSessions: currentPeriodStats.sessions,
      avgSessionDuration: avgDuration,
      changePercent,
      reservations: 0,
      experienceBookings: 0,
      uniqueVisitors: currentPeriodStats.uniqueVisitors,
      pagesPerSession: currentPeriodStats.sessions > 0
        ? Math.round((currentPeriodStats.pageViews / currentPeriodStats.sessions) * 100) / 100
        : 0,
      returningVisitors: currentPeriodStats.returningVisitors
    }

    // Fetch additional business metrics (Reservations and Experience Bookings)
    try {
      const startIso = `${startDate}T00:00:00.000Z`
      const endIso = `${endDate}T23:59:59.999Z`

      const resCount = await queryFirst<{ count: number }>(db, `
        SELECT COUNT(*) as count
        FROM reservation_submissions
        WHERE site_id = ? AND created_at >= ? AND created_at <= ?
      `, [siteId, startIso, endIso])

      const expCount = await queryFirst<{ count: number }>(db, `
        SELECT COUNT(*) as count
        FROM experience_bookings
        WHERE site_id = ? AND created_at >= ? AND created_at <= ?
      `, [siteId, startIso, endIso])

      metrics.reservations = toNumber(resCount?.count)
      metrics.experienceBookings = toNumber(expCount?.count)
    } catch (e) {
      console.warn('Failed to fetch business metrics:', e)
    }

    return jsonResponse({
      metrics,
      dailyData,
      topPages,
      countries,
      cities,
      referrers,
      devices,
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
