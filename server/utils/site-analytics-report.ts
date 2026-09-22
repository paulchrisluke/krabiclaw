import { z } from 'zod'
import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { localDateBounds, parseAnalyticsRange } from '~/server/utils/analytics-calendar'
import { addLocalDays, localDateAt, isValidTimezone } from '~/utils/timezone'

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

export async function resolveSiteAnalyticsContext(db: DbClient, organizationId: string): Promise<SiteContext> {
  const row = await queryFirst<{ organization_id: string; analytics_data_start_at: string | null; timezone: string | null }>(db, `
    SELECT s.organization_id, s.analytics_data_start_at, json_extract(s.settings_json, '$.config.default_timezone') AS timezone
    FROM organization s
    WHERE s.id = ? LIMIT 1
  `, [organizationId])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
  if (!isValidTimezone(row.timezone)) throw new HTTPError({ statusCode: 422, statusMessage: 'Site default_timezone is missing or invalid' })
  return {
    organizationId: row.organization_id,
    timezone: row.timezone,
    analyticsDataStartAt: row.analytics_data_start_at,
  }
}

const sessionFactsSql = `SELECT id, organization_id, key session_id,
  (payload_json ->> '$.visitor_id') visitor_id,
  (payload_json ->> '$.started_at') started_at,
  (payload_json ->> '$.last_seen_at') last_seen_at,
  (payload_json ->> '$.duration_seconds') duration_seconds,
  (payload_json ->> '$.attribution.source') source,
  (payload_json ->> '$.attribution.medium') medium,
  (payload_json ->> '$.attribution.campaign') campaign
  FROM analytics_summaries WHERE kind = 'session'`

const daySummariesSql = `WITH input AS (SELECT ? organization_id, ? starts_at, ? ends_at),
  views AS (
    SELECT e.*, (payload_json ->> '$.country') country,
      (payload_json ->> '$.region') region, (payload_json ->> '$.city') city,
      (payload_json ->> '$.user_agent') user_agent, (payload_json ->> '$.referrer') referrer
    FROM analytics_events e JOIN input i ON e.organization_id = i.organization_id
    WHERE e.kind = 'pageview' AND e.created_at >= i.starts_at AND e.created_at < i.ends_at
  ), sessions AS (SELECT * FROM (${sessionFactsSql}) WHERE organization_id = (SELECT organization_id FROM input)),
  metrics AS (SELECT COUNT(*) page_views, COUNT(DISTINCT session_id) unique_sessions,
    COUNT(DISTINCT visitor_id) unique_visitors FROM views),
  dimensions AS (
    SELECT 'country' dimension, CASE WHEN country GLOB '[A-Za-z][A-Za-z]' THEN upper(country) ELSE 'XX' END value, '' subvalue FROM views
    UNION ALL SELECT 'city', COALESCE(NULLIF(city, ''), 'Unknown'),
      COALESCE(region, '') || '|' || CASE WHEN country GLOB '[A-Za-z][A-Za-z]' THEN upper(country) ELSE 'XX' END FROM views
    UNION ALL SELECT 'device', CASE
      WHEN lower(user_agent) LIKE '%ipad%' OR lower(user_agent) LIKE '%tablet%' THEN 'Tablet'
      WHEN lower(user_agent) LIKE '%mobile%' OR lower(user_agent) LIKE '%android%' THEN 'Mobile'
      WHEN user_agent IS NULL OR user_agent = '' THEN 'Unknown' ELSE 'Desktop' END, '' FROM views
    UNION ALL SELECT 'referrer', CASE
      WHEN v.referrer IS NULL OR v.referrer = '' THEN 'Direct'
      WHEN EXISTS (SELECT 1 FROM organization_domains d WHERE d.organization_id = v.organization_id AND d.status = 'active' AND lower(d.domain) = lower(v.referrer)) THEN 'Internal'
      ELSE lower(v.referrer) END, '' FROM views v
  )
  SELECT 'site_day' kind, '' key, json_object(
    'page_views', page_views, 'unique_sessions', unique_sessions, 'unique_visitors', unique_visitors,
    'returning_visitors', (SELECT COUNT(DISTINCT current.visitor_id) FROM views current WHERE EXISTS (
      SELECT 1 FROM sessions previous WHERE previous.visitor_id = current.visitor_id
        AND previous.session_id <> current.session_id AND previous.started_at < (SELECT starts_at FROM input))),
    'avg_session_duration', COALESCE((SELECT ROUND(AVG(duration_seconds)) FROM sessions
      WHERE started_at < (SELECT ends_at FROM input) AND last_seen_at >= (SELECT starts_at FROM input) AND duration_seconds > 0), 0),
    'pages_per_session', CASE WHEN unique_sessions = 0 THEN 0 ELSE ROUND(CAST(page_views AS REAL) / unique_sessions, 2) END
  ) payload_json FROM metrics
  UNION ALL SELECT 'page_day', page_path, json_object('page_views', COUNT(*)) FROM views GROUP BY page_path
  UNION ALL SELECT 'dimension_day', json_array(dimension, value, subvalue), json_object('page_views', COUNT(*))
    FROM dimensions GROUP BY dimension, value, subvalue`

interface AnalyticsSummaryRow {
  kind: 'site_day' | 'page_day' | 'dimension_day'
  date: string
  key: string
  payload_json: string
}

const dayMetricsSchema = z.object({
  page_views: z.number().nonnegative(), unique_sessions: z.number().nonnegative(),
  unique_visitors: z.number().nonnegative(), returning_visitors: z.number().nonnegative(),
  avg_session_duration: z.number().nonnegative(), pages_per_session: z.number().nonnegative(),
})
const viewCountSchema = z.object({ page_views: z.number().nonnegative() })
const dimensionKeySchema = z.tuple([z.enum(['country', 'city', 'device', 'referrer']), z.string(), z.string()])

function dailySlice(date: string, rows: Omit<AnalyticsSummaryRow, 'date'>[]): DailySlice {
  const summary = rows.find(row => row.kind === 'site_day')
  if (!summary) throw new Error(`Analytics day summary missing: ${date}`)
  const metrics = dayMetricsSchema.parse(JSON.parse(summary.payload_json))
  return {
    date, pageViews: metrics.page_views, sessions: metrics.unique_sessions, visitors: metrics.unique_visitors,
    returningVisitors: metrics.returning_visitors, avgDuration: metrics.avg_session_duration, pagesPerSession: metrics.pages_per_session,
    pages: rows.filter(row => row.kind === 'page_day').map(row => ({ value: row.key, views: viewCountSchema.parse(JSON.parse(row.payload_json)).page_views })),
    dimensions: rows.filter(row => row.kind === 'dimension_day').map(row => {
      const [dimension, value, subvalue] = dimensionKeySchema.parse(JSON.parse(row.key))
      return { dimension, value, subvalue, views: viewCountSchema.parse(JSON.parse(row.payload_json)).page_views }
    }),
  }
}

export async function aggregateSiteAnalyticsDate(db: DbClient, organizationId: string, date: string): Promise<void> {
  const context = await resolveSiteAnalyticsContext(db, organizationId)
  const { start, end } = localDateBounds(date, context.timezone)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: "DELETE FROM analytics_summaries WHERE organization_id = ? AND date = ? AND kind IN ('page_day', 'dimension_day')", params: [organizationId, date] },
    {
      query: `INSERT INTO analytics_summaries (id, kind, organization_id, organization_id, date, key, payload_json, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), kind, ?, ?, ?, key, payload_json, ?, ? FROM (${daySummariesSql}) WHERE true
        ON CONFLICT(organization_id, kind, date, key) DO UPDATE SET organization_id = excluded.organization_id,
          payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      params: [context.organizationId, organizationId, date, now, now, organizationId, start, end],
    },
  ], { operation: `aggregate analytics for ${organizationId} ${date}` })
}

async function loadSlices(db: DbClient, organizationId: string, dates: string[], timezone: string, now: Date, cutoffDate: string | null): Promise<DailySlice[]> {
  if (dates.length === 0) return []
  const rows = await queryAll<AnalyticsSummaryRow>(db, `SELECT kind, date, key, payload_json FROM analytics_summaries
    WHERE organization_id = ? AND kind IN ('site_day', 'page_day', 'dimension_day') AND date BETWEEN ? AND ?`, [organizationId, dates[0]!, dates.at(-1)!])
  const rawRetentionCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString()
  const result: DailySlice[] = []
  for (const date of dates) {
    const dayRows = rows.filter(row => row.date === date)
    if (dayRows.some(row => row.kind === 'site_day')) {
      result.push(dailySlice(date, dayRows))
      continue
    }
    if (cutoffDate && date < cutoffDate) {
      result.push({ date, pageViews: 0, sessions: 0, visitors: 0, returningVisitors: 0, avgDuration: 0, pagesPerSession: 0, pages: [], dimensions: [] })
      continue
    }
    const { start, end } = localDateBounds(date, timezone)
    if (start < rawRetentionCutoff) throw new HTTPError({ statusCode: 500, statusMessage: `Analytics aggregate missing for retained date ${date}` })
    result.push(dailySlice(date, await queryAll<Omit<AnalyticsSummaryRow, 'date'>>(db, daySummariesSql, [organizationId, start, end])))
  }
  return result
}

export async function getSiteAnalyticsReport(db: DbClient, input: {
  organizationId: string; startDate?: string; endDate?: string; now?: Date
}): Promise<SiteAnalyticsReport> {
  const now = input.now ?? new Date()
  const context = await resolveSiteAnalyticsContext(db, input.organizationId)
  const range = parseAnalyticsRange({ startDate: input.startDate, endDate: input.endDate, timeZone: context.timezone, now })
  const { start } = localDateBounds(range.startDate, context.timezone)
  const { end } = localDateBounds(range.endDate, context.timezone)
  const cutoffDate = context.analyticsDataStartAt ? localDateAt(new Date(context.analyticsDataStartAt), context.timezone) : null
  const slices = await loadSlices(db, input.organizationId, range.dates, context.timezone, now, cutoffDate)
  const pageViews = slices.reduce((sum, slice) => sum + slice.pageViews, 0)
  const [sessionStats, returningStats, attributionRows, conversionRows, attributionConversions] = await Promise.all([
    queryFirst<Record<string, unknown>>(db, `SELECT COUNT(*) sessions, COUNT(DISTINCT visitor_id) visitors,
      COALESCE(ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END)), 0) avg_duration
      FROM (${sessionFactsSql}) WHERE organization_id = ? AND started_at < ? AND last_seen_at >= ?`, [input.organizationId, end, start]),
    queryFirst<{ count: number }>(db, `SELECT COUNT(DISTINCT current.visitor_id) count FROM (${sessionFactsSql}) current
      WHERE current.organization_id = ? AND current.started_at < ? AND current.last_seen_at >= ?
      AND EXISTS (SELECT 1 FROM (${sessionFactsSql}) previous WHERE previous.organization_id = current.organization_id
        AND previous.visitor_id = current.visitor_id AND previous.session_id <> current.session_id
        AND previous.started_at < ?)`, [input.organizationId, end, start, start]),
    queryAll<Record<string, unknown>>(db, `SELECT source, medium, campaign, COUNT(*) sessions
      FROM (${sessionFactsSql}) WHERE organization_id = ? AND started_at < ? AND last_seen_at >= ? GROUP BY 1,2,3`, [input.organizationId, end, start]),
    queryAll<Record<string, unknown>>(db, `SELECT (payload_json ->> '$.event_name') event_name, (payload_json ->> '$.stage') stage, COUNT(*) count FROM analytics_events
      WHERE kind = 'conversion' AND organization_id = ? AND created_at >= ? AND created_at < ? GROUP BY event_name, stage ORDER BY count DESC`, [input.organizationId, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT (payload_json ->> '$.attribution.source') source, (payload_json ->> '$.attribution.medium') medium, (payload_json ->> '$.attribution.campaign') campaign, COUNT(*) conversions FROM analytics_events
      WHERE kind = 'conversion' AND organization_id = ? AND created_at >= ? AND created_at < ? GROUP BY 1,2,3`, [input.organizationId, start, end]),
  ])
  const uniqueSessions = n(sessionStats?.sessions)
  const previousStart = localDateBounds(range.previousStartDate, context.timezone).start
  const previousAvailable = !context.analyticsDataStartAt || previousStart >= context.analyticsDataStartAt
  let changePercent: number | null = null
  if (previousAvailable) {
    const previousDates = []
    for (let date = range.previousStartDate; date <= range.previousEndDate; date = addLocalDays(date, 1)) previousDates.push(date)
    const previousViews = (await loadSlices(db, input.organizationId, previousDates, context.timezone, now, cutoffDate)).reduce((sum, slice) => sum + slice.pageViews, 0)
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
  const sites = await queryAll<{ id: string; timezone: string | null }>(db, `SELECT s.id, json_extract(s.settings_json, '$.config.default_timezone') AS timezone FROM organization s WHERE s.status = 'active'`)
  const aggregated: string[] = []
  for (const site of sites) {
    if (!isValidTimezone(site.timezone)) throw new Error(`Site ${site.id} default_timezone is missing or invalid`)
    const timezone = site.timezone
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
    SELECT s.id, json_extract(s.settings_json, '$.config.default_timezone') AS timezone FROM organization s
  `)
  const initialResults = await executeBatch(db, [
    { query: "DELETE FROM analytics_events WHERE kind = 'pageview' AND created_at < ?", params: [rawCutoff] },
    { query: "DELETE FROM analytics_summaries WHERE kind = 'session' AND (payload_json ->> '$.last_seen_at') < ?", params: [retainedCutoff] },
  ], { operation: 'clean retained tenant analytics events and sessions' })
  let changes = initialResults.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0)
  for (const site of sites) {
    if (!isValidTimezone(site.timezone)) throw new Error(`Site ${site.id} default_timezone is missing or invalid`)
    const timezone = site.timezone
    const retainedDate = addLocalDays(localDateAt(now, timezone), -739)
    const results = await executeBatch(db, [
      { query: "DELETE FROM analytics_summaries WHERE organization_id = ? AND kind IN ('site_day', 'page_day', 'dimension_day') AND date < ?", params: [site.id, retainedDate] },
    ], { operation: `clean retained tenant analytics aggregates for ${site.id}` })
    changes += results.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0)
  }
  return changes
}
