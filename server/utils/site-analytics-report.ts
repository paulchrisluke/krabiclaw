import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import {
  addLocalDays,
  localDateAt,
  localDateBounds,
  parseAnalyticsRange,
  isValidTimeZone,
} from '~/server/utils/analytics-calendar'

export interface SiteAnalyticsReport {
  period: { startDate: string; endDate: string; timezone: string; analyticsDataStartAt: string | null }
  metrics: {
    pageViews: number
    uniqueSessions: number
    uniqueVisitors: number
    returningVisitors: number
    avgSessionDuration: number
    pagesPerSession: number
    changePercent: number | null
  }
  dailyData: Array<{ date: string; pageViews: number; sessions: number; avgDuration: number }>
  topPages: Array<{ path: string; views: number; percentOfTotal: number }>
  attribution: Array<{ source: string; medium: string; campaign: string | null; sessions: number; conversions: number; conversionRate: number }>
  conversions: Array<{ eventName: string; stage: string; count: number; conversionRate: number }>
  countries: Array<{ country: string; countryCode: string; views: number; percentOfTotal: number }>
  cities: Array<{ city: string; region: string | null; countryCode: string; views: number }>
  referrers: Array<{ source: string; views: number; percentOfTotal: number }>
  devices: Array<{ type: string; views: number; percentOfTotal: number }>
}

interface SiteContext {
  organizationId: string
  timezone: string
  analyticsDataStartAt: string | null
}

interface DailySlice {
  date: string
  pageViews: number
  sessions: number
  visitors: number
  returningVisitors: number
  avgDuration: number
  pagesPerSession: number
  pages: Array<{ value: string; views: number }>
  dimensions: Array<{ dimension: string; value: string; subvalue: string; views: number }>
}

const n = (value: unknown) => Number(value || 0)

export async function resolveSiteAnalyticsContext(db: DbClient, siteId: string): Promise<SiteContext> {
  const row = await queryFirst<{ organization_id: string; analytics_data_start_at: string | null; timezone: string | null }>(db, `
    SELECT s.organization_id, s.analytics_data_start_at, bl.timezone
    FROM sites s
    LEFT JOIN business_locations bl ON bl.id = s.primary_location_id AND bl.site_id = s.id
    WHERE s.id = ? LIMIT 1
  `, [siteId])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  return {
    organizationId: row.organization_id,
    timezone: isValidTimeZone(row.timezone) ? row.timezone : 'UTC',
    analyticsDataStartAt: row.analytics_data_start_at,
  }
}

export async function aggregateSiteAnalyticsDate(db: DbClient, siteId: string, date: string): Promise<void> {
  const context = await resolveSiteAnalyticsContext(db, siteId)
  const { start, end } = localDateBounds(date, context.timezone)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: 'DELETE FROM site_analytics_page_daily WHERE site_id = ? AND date = ?', params: [siteId, date] },
    { query: 'DELETE FROM site_analytics_dimension_daily WHERE site_id = ? AND date = ?', params: [siteId, date] },
    {
      query: `INSERT INTO site_analytics_daily (
        id, organization_id, site_id, date, page_views, unique_sessions, unique_visitors,
        returning_visitors, avg_session_duration, pages_per_session, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        (SELECT COUNT(*) FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?),
        (SELECT COUNT(DISTINCT session_id) FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?),
        (SELECT COUNT(DISTINCT visitor_id) FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?),
        (SELECT COUNT(DISTINCT current.visitor_id) FROM site_pageview_events current
          WHERE current.site_id = ? AND current.created_at >= ? AND current.created_at < ?
          AND EXISTS (SELECT 1 FROM site_analytics_sessions previous WHERE previous.site_id = current.site_id
            AND previous.visitor_id = current.visitor_id AND previous.session_id <> current.session_id
            AND previous.started_at < ?)),
        COALESCE((SELECT ROUND(AVG(duration_seconds)) FROM site_analytics_sessions
          WHERE site_id = ? AND started_at < ? AND last_seen_at >= ? AND duration_seconds > 0), 0),
        CASE WHEN (SELECT COUNT(DISTINCT session_id) FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?) = 0 THEN 0
          ELSE ROUND(CAST((SELECT COUNT(*) FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?) AS REAL)
            / (SELECT COUNT(DISTINCT session_id) FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?), 2) END,
        ?, ?
      ) ON CONFLICT(site_id, date) DO UPDATE SET
        organization_id = excluded.organization_id, page_views = excluded.page_views,
        unique_sessions = excluded.unique_sessions, unique_visitors = excluded.unique_visitors,
        returning_visitors = excluded.returning_visitors, avg_session_duration = excluded.avg_session_duration,
        pages_per_session = excluded.pages_per_session, updated_at = excluded.updated_at`,
      params: [
        crypto.randomUUID(), context.organizationId, siteId, date,
        siteId, start, end, siteId, start, end, siteId, start, end,
        siteId, start, end, start,
        siteId, end, start,
        siteId, start, end, siteId, start, end, siteId, start, end,
        now, now,
      ],
    },
    {
      query: `INSERT INTO site_analytics_page_daily
        (id, organization_id, site_id, date, page_path, page_views, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), ?, site_id, ?, page_path, COUNT(*), ?, ?
        FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY page_path`,
      params: [context.organizationId, date, now, now, siteId, start, end],
    },
    {
      query: `INSERT INTO site_analytics_dimension_daily
        (id, organization_id, site_id, date, dimension, value, subvalue, page_views, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), ?, site_id, ?, 'country',
          CASE WHEN country GLOB '[A-Za-z][A-Za-z]' THEN upper(country) ELSE 'XX' END, '', COUNT(*), ?, ?
        FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?
        GROUP BY CASE WHEN country GLOB '[A-Za-z][A-Za-z]' THEN upper(country) ELSE 'XX' END`,
      params: [context.organizationId, date, now, now, siteId, start, end],
    },
    {
      query: `INSERT INTO site_analytics_dimension_daily
        (id, organization_id, site_id, date, dimension, value, subvalue, page_views, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), ?, site_id, ?, 'city', COALESCE(NULLIF(city, ''), 'Unknown'),
          COALESCE(region, '') || '|' || CASE WHEN country GLOB '[A-Za-z][A-Za-z]' THEN upper(country) ELSE 'XX' END,
          COUNT(*), ?, ? FROM site_pageview_events
        WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY 6, 7`,
      params: [context.organizationId, date, now, now, siteId, start, end],
    },
    {
      query: `INSERT INTO site_analytics_dimension_daily
        (id, organization_id, site_id, date, dimension, value, subvalue, page_views, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), ?, site_id, ?, 'device', CASE
          WHEN lower(user_agent) LIKE '%ipad%' OR lower(user_agent) LIKE '%tablet%' THEN 'Tablet'
          WHEN lower(user_agent) LIKE '%mobile%' OR lower(user_agent) LIKE '%android%' THEN 'Mobile'
          WHEN user_agent IS NULL OR user_agent = '' THEN 'Unknown' ELSE 'Desktop' END, '', COUNT(*), ?, ?
        FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY 6`,
      params: [context.organizationId, date, now, now, siteId, start, end],
    },
    {
      query: `INSERT INTO site_analytics_dimension_daily
        (id, organization_id, site_id, date, dimension, value, subvalue, page_views, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), ?, events.site_id, ?, 'referrer', CASE
          WHEN events.referrer IS NULL OR events.referrer = '' THEN 'Direct'
          WHEN EXISTS (SELECT 1 FROM site_domains domains WHERE domains.site_id = events.site_id AND domains.status = 'active' AND lower(domains.domain) = lower(events.referrer)) THEN 'Internal'
          ELSE lower(events.referrer) END, '', COUNT(*), ?, ?
        FROM site_pageview_events events WHERE events.site_id = ? AND events.created_at >= ? AND events.created_at < ? GROUP BY 6`,
      params: [context.organizationId, date, now, now, siteId, start, end],
    },
  ], { operation: `aggregate analytics for ${siteId} ${date}` })
}

async function readRawDate(db: DbClient, siteId: string, date: string, timezone: string): Promise<DailySlice> {
  const { start, end } = localDateBounds(date, timezone)
  const [summary, pages, country, city, device, referrer] = await Promise.all([
    queryFirst<Record<string, unknown>>(db, `SELECT COUNT(*) page_views, COUNT(DISTINCT session_id) sessions,
      COUNT(DISTINCT visitor_id) visitors,
      COALESCE((SELECT ROUND(AVG(duration_seconds)) FROM site_analytics_sessions WHERE site_id = ? AND started_at < ? AND last_seen_at >= ? AND duration_seconds > 0), 0) avg_duration
      FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ?`, [siteId, end, start, siteId, start, end]),
    queryAll<{ value: string; views: number }>(db, `SELECT page_path value, COUNT(*) views FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY page_path`, [siteId, start, end]),
    queryAll<{ value: string; subvalue: string; views: number }>(db, `SELECT CASE WHEN country GLOB '[A-Za-z][A-Za-z]' THEN upper(country) ELSE 'XX' END value, '' subvalue, COUNT(*) views FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY 1`, [siteId, start, end]),
    queryAll<{ value: string; subvalue: string; views: number }>(db, `SELECT COALESCE(NULLIF(city,''),'Unknown') value, COALESCE(region,'') || '|' || CASE WHEN country GLOB '[A-Za-z][A-Za-z]' THEN upper(country) ELSE 'XX' END subvalue, COUNT(*) views FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY 1,2`, [siteId, start, end]),
    queryAll<{ value: string; subvalue: string; views: number }>(db, `SELECT CASE WHEN lower(user_agent) LIKE '%ipad%' OR lower(user_agent) LIKE '%tablet%' THEN 'Tablet' WHEN lower(user_agent) LIKE '%mobile%' OR lower(user_agent) LIKE '%android%' THEN 'Mobile' WHEN user_agent IS NULL OR user_agent = '' THEN 'Unknown' ELSE 'Desktop' END value, '' subvalue, COUNT(*) views FROM site_pageview_events WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY 1`, [siteId, start, end]),
    queryAll<{ value: string; subvalue: string; views: number }>(db, `SELECT CASE WHEN events.referrer IS NULL OR events.referrer = '' THEN 'Direct' WHEN EXISTS (SELECT 1 FROM site_domains d WHERE d.site_id = events.site_id AND d.status = 'active' AND lower(d.domain) = lower(events.referrer)) THEN 'Internal' ELSE lower(events.referrer) END value, '' subvalue, COUNT(*) views FROM site_pageview_events events WHERE events.site_id = ? AND events.created_at >= ? AND events.created_at < ? GROUP BY 1`, [siteId, start, end]),
  ])
  const sessions = n(summary?.sessions)
  const pageViews = n(summary?.page_views)
  return {
    date, pageViews, sessions, visitors: n(summary?.visitors), returningVisitors: 0,
    avgDuration: n(summary?.avg_duration), pagesPerSession: sessions ? Math.round(pageViews / sessions * 100) / 100 : 0,
    pages: pages.map(row => ({ value: row.value, views: n(row.views) })),
    dimensions: [
      ...country.map(row => ({ dimension: 'country', ...row, views: n(row.views) })),
      ...city.map(row => ({ dimension: 'city', ...row, views: n(row.views) })),
      ...device.map(row => ({ dimension: 'device', ...row, views: n(row.views) })),
      ...referrer.map(row => ({ dimension: 'referrer', ...row, views: n(row.views) })),
    ],
  }
}

async function loadSlices(db: DbClient, siteId: string, dates: string[], timezone: string, now: Date, cutoffDate: string | null): Promise<DailySlice[]> {
  if (dates.length === 0) return []
  const startDate = dates[0]!
  const endDate = dates.at(-1)!
  const [daily, pages, dimensions] = await Promise.all([
    queryAll<Record<string, unknown>>(db, 'SELECT * FROM site_analytics_daily WHERE site_id = ? AND date BETWEEN ? AND ?', [siteId, startDate, endDate]),
    queryAll<Record<string, unknown>>(db, 'SELECT date, page_path, page_views FROM site_analytics_page_daily WHERE site_id = ? AND date BETWEEN ? AND ?', [siteId, startDate, endDate]),
    queryAll<Record<string, unknown>>(db, 'SELECT date, dimension, value, subvalue, page_views FROM site_analytics_dimension_daily WHERE site_id = ? AND date BETWEEN ? AND ?', [siteId, startDate, endDate]),
  ])
  const byDate = new Map(daily.map(row => [String(row.date), row]))
  const rawRetentionCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString()
  const result: DailySlice[] = []
  for (const date of dates) {
    const row = byDate.get(date)
    if (!row) {
      if (cutoffDate && date < cutoffDate) {
        result.push({ date, pageViews: 0, sessions: 0, visitors: 0, returningVisitors: 0, avgDuration: 0, pagesPerSession: 0, pages: [], dimensions: [] })
        continue
      }
      if (localDateBounds(date, timezone).start < rawRetentionCutoff) {
        throw new HTTPError({ statusCode: 500, statusMessage: `Analytics aggregate missing for retained date ${date}` })
      }
      result.push(await readRawDate(db, siteId, date, timezone))
      continue
    }
    const sessions = n(row.unique_sessions)
    result.push({
      date,
      pageViews: n(row.page_views),
      sessions,
      visitors: n(row.unique_visitors),
      returningVisitors: n(row.returning_visitors),
      avgDuration: n(row.avg_session_duration),
      pagesPerSession: n(row.pages_per_session),
      pages: pages.filter(page => page.date === date).map(page => ({ value: String(page.page_path), views: n(page.page_views) })),
      dimensions: dimensions.filter(value => value.date === date).map(value => ({
        dimension: String(value.dimension), value: String(value.value), subvalue: String(value.subvalue || ''), views: n(value.page_views),
      })),
    })
  }
  return result
}

export async function getSiteAnalyticsReport(db: DbClient, input: {
  siteId: string; startDate?: string; endDate?: string; now?: Date
}): Promise<SiteAnalyticsReport> {
  const now = input.now ?? new Date()
  const context = await resolveSiteAnalyticsContext(db, input.siteId)
  const range = parseAnalyticsRange({ startDate: input.startDate, endDate: input.endDate, timeZone: context.timezone, now })
  const { start } = localDateBounds(range.startDate, context.timezone)
  const { end } = localDateBounds(range.endDate, context.timezone)
  const cutoffDate = context.analyticsDataStartAt ? localDateAt(new Date(context.analyticsDataStartAt), context.timezone) : null
  const slices = await loadSlices(db, input.siteId, range.dates, context.timezone, now, cutoffDate)
  const pageViews = slices.reduce((sum, slice) => sum + slice.pageViews, 0)
  const [sessionStats, returningStats, attributionRows, conversionRows, attributionConversions] = await Promise.all([
    queryFirst<Record<string, unknown>>(db, `SELECT COUNT(*) sessions, COUNT(DISTINCT visitor_id) visitors,
      COALESCE(ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END)), 0) avg_duration
      FROM site_analytics_sessions WHERE site_id = ? AND started_at < ? AND last_seen_at >= ?`, [input.siteId, end, start]),
    queryFirst<{ count: number }>(db, `SELECT COUNT(DISTINCT current.visitor_id) count FROM site_analytics_sessions current
      WHERE current.site_id = ? AND current.started_at < ? AND current.last_seen_at >= ?
      AND EXISTS (SELECT 1 FROM site_analytics_sessions previous WHERE previous.site_id = current.site_id
        AND previous.visitor_id = current.visitor_id AND previous.session_id <> current.session_id
        AND previous.started_at < ?)`, [input.siteId, end, start, start]),
    queryAll<Record<string, unknown>>(db, `SELECT last_touch_source source, last_touch_medium medium, last_touch_campaign campaign, COUNT(*) sessions
      FROM site_analytics_sessions WHERE site_id = ? AND started_at < ? AND last_seen_at >= ? GROUP BY 1,2,3`, [input.siteId, end, start]),
    queryAll<Record<string, unknown>>(db, `SELECT event_name, stage, COUNT(*) count FROM site_conversion_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY event_name, stage ORDER BY count DESC`, [input.siteId, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT source, medium, campaign, COUNT(*) conversions FROM site_conversion_events
      WHERE site_id = ? AND created_at >= ? AND created_at < ? GROUP BY 1,2,3`, [input.siteId, start, end]),
  ])
  const uniqueSessions = n(sessionStats?.sessions)
  const previousStart = localDateBounds(range.previousStartDate, context.timezone).start
  const previousAvailable = !context.analyticsDataStartAt || previousStart >= context.analyticsDataStartAt
  let changePercent: number | null = null
  if (previousAvailable) {
    const previousDates = []
    for (let date = range.previousStartDate; date <= range.previousEndDate; date = addLocalDays(date, 1)) previousDates.push(date)
    const previousViews = (await loadSlices(db, input.siteId, previousDates, context.timezone, now, cutoffDate)).reduce((sum, slice) => sum + slice.pageViews, 0)
    changePercent = previousViews === 0 ? 0 : Math.round((pageViews - previousViews) / previousViews * 100)
  }

  const pageMap = new Map<string, number>()
  const dimensionMaps = new Map<string, Map<string, number>>()
  for (const slice of slices) {
    for (const page of slice.pages) pageMap.set(page.value, (pageMap.get(page.value) ?? 0) + page.views)
    for (const dimension of slice.dimensions) {
      const map = dimensionMaps.get(dimension.dimension) ?? new Map<string, number>()
      const key = `${dimension.value}\u0000${dimension.subvalue}`
      map.set(key, (map.get(key) ?? 0) + dimension.views)
      dimensionMaps.set(dimension.dimension, map)
    }
  }
  const rate = (count: number) => uniqueSessions ? Math.round(count / uniqueSessions * 10_000) / 100 : 0
  const conversionMap = new Map(attributionConversions.map(row => [`${row.source}\u0000${row.medium}\u0000${row.campaign ?? ''}`, n(row.conversions)]))
  const percent = (views: number) => pageViews ? Math.round(views / pageViews * 100) : 0
  const dimensionRows = (name: string) => Array.from(dimensionMaps.get(name) ?? []).map(([key, views]) => {
    const [value, subvalue = ''] = key.split('\u0000')
    return { value: value!, subvalue, views }
  }).sort((a, b) => b.views - a.views)

  return {
    period: { startDate: range.startDate, endDate: range.endDate, timezone: context.timezone, analyticsDataStartAt: context.analyticsDataStartAt },
    metrics: {
      pageViews,
      uniqueSessions,
      uniqueVisitors: n(sessionStats?.visitors),
      returningVisitors: n(returningStats?.count),
      avgSessionDuration: n(sessionStats?.avg_duration),
      pagesPerSession: uniqueSessions ? Math.round(pageViews / uniqueSessions * 100) / 100 : 0,
      changePercent,
    },
    dailyData: slices.map(slice => ({ date: slice.date, pageViews: slice.pageViews, sessions: slice.sessions, avgDuration: slice.avgDuration })),
    topPages: Array.from(pageMap, ([path, views]) => ({ path, views, percentOfTotal: percent(views) })).sort((a, b) => b.views - a.views).slice(0, 10),
    attribution: attributionRows.map(row => {
      const sessions = n(row.sessions)
      const conversions = conversionMap.get(`${row.source}\u0000${row.medium}\u0000${row.campaign ?? ''}`) ?? 0
      return { source: String(row.source), medium: String(row.medium), campaign: row.campaign ? String(row.campaign) : null, sessions, conversions, conversionRate: sessions ? Math.round(conversions / sessions * 10_000) / 100 : 0 }
    }).sort((a, b) => b.sessions - a.sessions),
    conversions: conversionRows.map(row => ({ eventName: String(row.event_name), stage: String(row.stage), count: n(row.count), conversionRate: rate(n(row.count)) })),
    countries: dimensionRows('country').slice(0, 12).map(row => ({ country: row.value, countryCode: row.value, views: row.views, percentOfTotal: percent(row.views) })),
    cities: dimensionRows('city').slice(0, 10).map(row => {
      const [region, countryCode = 'XX'] = row.subvalue.split('|')
      return { city: row.value, region: region || null, countryCode, views: row.views }
    }),
    referrers: dimensionRows('referrer').slice(0, 10).map(row => ({ source: row.value, views: row.views, percentOfTotal: percent(row.views) })),
    devices: dimensionRows('device').map(row => ({ type: row.value, views: row.views, percentOfTotal: percent(row.views) })),
  }
}

export async function aggregatePreviousLocalDateForAllSites(db: DbClient, now = new Date()): Promise<string[]> {
  const sites = await queryAll<{ id: string; timezone: string | null }>(db, `SELECT s.id, bl.timezone FROM sites s LEFT JOIN business_locations bl ON bl.id = s.primary_location_id AND bl.site_id = s.id WHERE s.status = 'active'`)
  const aggregated: string[] = []
  for (const site of sites) {
    const timezone = isValidTimeZone(site.timezone) ? site.timezone : 'UTC'
    const date = addLocalDays(localDateAt(now, timezone), -1)
    await aggregateSiteAnalyticsDate(db, site.id, date)
    aggregated.push(`${site.id}:${date}`)
  }
  return aggregated
}

export async function cleanupTenantAnalytics(db: DbClient, now = new Date()): Promise<number> {
  const rawCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString()
  const retainedCutoff = new Date(now.getTime() - 740 * 86_400_000).toISOString()
  const sites = await queryAll<{ id: string; timezone: string | null }>(db, `
    SELECT s.id, bl.timezone FROM sites s
    LEFT JOIN business_locations bl ON bl.id = s.primary_location_id AND bl.site_id = s.id
  `)
  const initialResults = await executeBatch(db, [
    { query: 'DELETE FROM site_pageview_events WHERE created_at < ?', params: [rawCutoff] },
    { query: 'DELETE FROM site_analytics_sessions WHERE last_seen_at < ?', params: [retainedCutoff] },
  ], { operation: 'clean retained tenant analytics events and sessions' })
  let changes = initialResults.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0)
  for (const site of sites) {
    const timezone = isValidTimeZone(site.timezone) ? site.timezone : 'UTC'
    const retainedDate = addLocalDays(localDateAt(now, timezone), -739)
    const results = await executeBatch(db, [
      { query: 'DELETE FROM site_analytics_daily WHERE site_id = ? AND date < ?', params: [site.id, retainedDate] },
      { query: 'DELETE FROM site_analytics_page_daily WHERE site_id = ? AND date < ?', params: [site.id, retainedDate] },
      { query: 'DELETE FROM site_analytics_dimension_daily WHERE site_id = ? AND date < ?', params: [site.id, retainedDate] },
    ], { operation: `clean retained tenant analytics aggregates for ${site.id}` })
    changes += results.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0)
  }
  return changes
}
