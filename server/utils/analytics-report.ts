import { z } from 'zod'
import { HTTPError } from 'nitro'
import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { localDateBounds, parseAnalyticsRange } from '~/server/utils/analytics-calendar'
import { addLocalDays, localDateAt, isValidTimezone } from '~/utils/timezone'
import type { CloudflareEnv } from '~/server/utils/auth'
import { CONVERSION_EVENT_CATALOG, ORGANIZATION_CONVERSION_EVENT_NAMES } from '~/utils/organization-conversion-events'
import { readMetaInsights, type ProviderInsights } from '~/server/utils/meta-insights'

export interface AnalyticsReport {
  social?: { facebook: ProviderInsights; instagram: ProviderInsights }
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
  /**
   * Sessions grouped by their current last-touch attribution, with the sessions in that same
   * group that completed an outcome in the range. `sessionConversionRate` = converting sessions /
   * these sessions (never above 100%); null when there are none.
   */
  attribution: Array<{ source: string; medium: string; campaign: string | null; content: string | null; sessions: number; outcomeEvents: number; convertingSessions: number; sessionConversionRate: number | null }>
  /**
   * Outcome events grouped by their own immutable attribution snapshot (the touch when the event
   * happened, or the checkout's observed touch for a payment). A different population from
   * `attribution`, so it carries counts only, never a rate against sessions.
   */
  outcomeAttribution: Array<{ source: string; medium: string; campaign: string | null; content: string | null; eventName: string; events: number; distinctEntities: number }>
  /** Verified revenue by the campaign/creative snapshot of the purchase, per currency. Cash includes tax; `netMinor` is collected minus refunded. Payments with no observed attribution have null source/medium. */
  attributedValue: Array<{ source: string | null; medium: string | null; campaign: string | null; content: string | null; currency: string; purchases: number; collectedMinor: number; refundedMinor: number; netMinor: number }>
  /**
   * `events` counts occurrences, `distinctEntities` counts the business subjects
   * (request, user, organization, invoice, refund) and `convertingSessions` the
   * browser sessions that completed the event. Nonbrowser events have no session.
   * `sessionConversionRate` = convertingSessions / eligible sessions in the range,
   * and is null when the range has no eligible sessions.
   */
  conversions: Array<{ eventName: string; stage: string; conversionType: string | null; events: number; distinctEntities: number; convertingSessions: number; nonbrowserEvents: number; sessionConversionRate: number | null }>
  /** One row per event, value basis and currency. Currencies are never summed together. `valueMinor` is tax-exclusive; `collectedMinor` is the cash moved, tax included: collected for a purchase, returned for a refund. */
  values: Array<{ eventName: string; basis: 'quoted' | 'purchase' | 'refund'; currency: string; events: number; valueMinor: number; collectedMinor: number | null }>
  /** Quoted booking value per product and location. A booking with no known price counts in `bookings` but not `valuedBookings`. */
  bookingValue: Array<{ productId: string | null; productName: string | null; locationId: string | null; currency: string | null; bookings: number; valuedBookings: number; quotedValueMinor: number }>
  /** Amount collected from verified purchases minus verified refunds, per currency. Both include tax. */
  net: Array<{ currency: string; collectedMinor: number; refundedMinor: number; netMinor: number }>
  /**
   * Signup-cohort attribution: signups created in the range, each linked through the
   * organizations that user originated (the first owner, recorded on the onboarding and purchase
   * events when they happened) to outcomes that occurred after the signup and by
   * `observedThrough`. Counted per signup; `revenue` is that cohort's payments to date. It never
   * rewrites those later events' own attribution.
   */
  signupCohort: {
    observedThrough: string
    signups: number
    onboardedSignups: number
    firstPaidSignups: number
    bySignupAttribution: Array<{ source: string | null; medium: string | null; campaign: string | null; content: string | null; signups: number; onboardedSignups: number; firstPaidSignups: number; revenue: Array<{ currency: string; collectedMinor: number; refundedMinor: number; netMinor: number }> }>
    /** Businesses (organizations) in the range, counted per organization and independent of signups: invitation and existing-user journeys are included. */
    onboardedBusinesses: number
    firstPaidBusinesses: number
  }
  coverage: {
    /** First event written by the current measurement contract for this organization; earlier history has no values, creative or nonbrowser events. Null until one exists. */
    measurementContractStartedAt: string | null
    /** Outcome events with no browser attribution (nonbrowser or attribution unobserved). */
    outcomeEventsWithoutAttribution: number
    /** GA4 delivery outcome of server-delivered events; provider failure is distinct from disabled, disconnected or consent-rejected. */
    ga4Delivery: Array<{ eventName: string; status: string; count: number }>
  }
  countries: Array<{ country: string; countryCode: string; views: number; percentOfTotal: number }>
  cities: Array<{ city: string; region: string | null; countryCode: string; views: number }>
  referrers: Array<{ source: string; views: number; percentOfTotal: number }>
  devices: Array<{ type: string; views: number; percentOfTotal: number }>
}

interface OrganizationContext {
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

const rate = (count: number, of: number) => of ? Math.round(count / of * 10_000) / 100 : null

const eventList = (predicate: (definition: typeof CONVERSION_EVENT_CATALOG[keyof typeof CONVERSION_EVENT_CATALOG]) => boolean) =>
  ORGANIZATION_CONVERSION_EVENT_NAMES.filter(name => predicate(CONVERSION_EVENT_CATALOG[name])).map(name => `'${name}'`).join(', ')
const OUTCOME_EVENT_SQL_LIST = eventList(definition => definition.outcome)
const SERVER_DELIVERED_EVENT_SQL_LIST = eventList(definition => definition.ga4Sender !== 'browser')

export async function resolveOrganizationAnalyticsContext(db: DbClient, organizationId: string): Promise<OrganizationContext> {
  const row = await queryFirst<{ organization_id: string; analytics_data_start_at: string | null; timezone: string | null }>(db, `
    SELECT s.id AS organization_id, s.analytics_data_start_at, json_extract(s.settings_json, '$.config.default_timezone') AS timezone
    FROM organization s
    WHERE s.id = ? LIMIT 1
  `, [organizationId])
  if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
  if (!isValidTimezone(row.timezone)) throw new HTTPError({ statusCode: 422, statusMessage: 'Organization default_timezone is missing or invalid' })
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
  (payload_json ->> '$.attribution.campaign') campaign,
  (payload_json ->> '$.attribution.content') content
  FROM analytics_summaries WHERE kind = 'session'`

// `views` is materialized: inlined, the planner folded it into the
// returning-visitor subquery and scanned every organization's pageviews on every
// date for each session, 12M rows for one day of one tenant.
const daySummariesSql = `WITH input AS (SELECT ? organization_id, ? starts_at, ? ends_at),
  views AS MATERIALIZED (
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
  SELECT 'organization_day' kind, '' key, json_object(
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
  kind: 'organization_day' | 'page_day' | 'dimension_day'
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
  const summary = rows.find(row => row.kind === 'organization_day')
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

export async function aggregateOrganizationAnalyticsDate(db: DbClient, organizationId: string, date: string): Promise<void> {
  const context = await resolveOrganizationAnalyticsContext(db, organizationId)
  const { start, end } = localDateBounds(date, context.timezone)
  const now = new Date().toISOString()
  await executeBatch(db, [
    { query: "DELETE FROM analytics_summaries WHERE organization_id = ? AND date = ? AND kind IN ('page_day', 'dimension_day')", params: [organizationId, date] },
    {
      query: `INSERT INTO analytics_summaries (id, kind, organization_id, date, key, payload_json, created_at, updated_at)
        SELECT lower(hex(randomblob(16))), kind, ?, ?, key, payload_json, ?, ? FROM (${daySummariesSql}) WHERE true
        ON CONFLICT(organization_id, kind, date, key) DO UPDATE SET organization_id = excluded.organization_id,
          payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      params: [context.organizationId, date, now, now, organizationId, start, end],
    },
  ], { operation: `aggregate analytics for ${organizationId} ${date}` })
}

async function loadSlices(db: DbClient, organizationId: string, dates: string[], timezone: string, now: Date, cutoffDate: string | null): Promise<DailySlice[]> {
  if (dates.length === 0) return []
  const rows = await queryAll<AnalyticsSummaryRow>(db, `SELECT kind, date, key, payload_json FROM analytics_summaries
    WHERE organization_id = ? AND kind IN ('organization_day', 'page_day', 'dimension_day') AND date BETWEEN ? AND ?`, [organizationId, dates[0]!, dates.at(-1)!])
  const rawRetentionCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString()
  const result: DailySlice[] = []
  for (const date of dates) {
    const dayRows = rows.filter(row => row.date === date)
    if (dayRows.some(row => row.kind === 'organization_day')) {
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

interface ConversionReportWindow { start: string; end: string; observedEnd: string; uniqueSessions: number }
type ConversionReport = Pick<AnalyticsReport, 'outcomeAttribution' | 'attributedValue' | 'conversions' | 'values' | 'bookingValue' | 'net' | 'signupCohort' | 'coverage'>

async function loadConversionReport(db: DbClient, organizationId: string, window: ConversionReportWindow): Promise<ConversionReport> {
  const { start, end, observedEnd, uniqueSessions } = window
  const inRange = `kind = 'conversion' AND organization_id = ? AND created_at >= ? AND created_at < ?`
  const eventName = `(payload_json ->> '$.event_name')`
  const snapshot = `(payload_json ->> '$.attribution.source') source, (payload_json ->> '$.attribution.medium') medium,
    (payload_json ->> '$.attribution.campaign') campaign, (payload_json ->> '$.attribution.content') content`
  // Signups in the window; outcomes that follow them are linked through the originating owner
  // recorded on the onboarding and purchase events, never through current membership.
  const signups = `WITH signups AS (
      SELECT e.created_at signed_at, (e.payload_json ->> '$.entity_id') user_id, (e.payload_json ->> '$.attribution.source') source, (e.payload_json ->> '$.attribution.medium') medium,
        (e.payload_json ->> '$.attribution.campaign') campaign, (e.payload_json ->> '$.attribution.content') content
      FROM analytics_events e WHERE e.kind = 'conversion' AND e.organization_id = ? AND (e.payload_json ->> '$.event_name') = 'sign_up' AND e.created_at >= ? AND e.created_at < ?)`
  const followedBy = (alias: string, eventFilter: string) => `EXISTS (SELECT 1 FROM analytics_events ${alias} WHERE ${alias}.kind = 'conversion' AND ${alias}.organization_id = ?
    AND ${eventFilter} AND (${alias}.payload_json ->> '$.metadata.originating_user_id') = signups.user_id AND ${alias}.created_at >= signups.signed_at AND ${alias}.created_at < ?)`
  const [conversionRows, outcomeRows, valueRows, attributedRows, bookingValueRows, cohortRows, cohortRevenueRows, businessStats, coverageRows, deliveryRows] = await Promise.all([
    queryAll<Record<string, unknown>>(db, `SELECT ${eventName} event_name, (payload_json ->> '$.stage') stage, (payload_json ->> '$.conversion_type') conversion_type,
        COUNT(*) events, COUNT(DISTINCT COALESCE(payload_json ->> '$.entity_id', id)) entities, COUNT(DISTINCT session_id) sessions, SUM(session_id IS NULL) nonbrowser
      FROM analytics_events WHERE ${inRange} GROUP BY 1,2,3 ORDER BY events DESC, event_name`, [organizationId, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT ${snapshot}, ${eventName} event_name, COUNT(*) events, COUNT(DISTINCT COALESCE(payload_json ->> '$.entity_id', id)) entities
      FROM analytics_events WHERE ${inRange} AND json_type(payload_json, '$.attribution.source') IS 'text' AND ${eventName} IN (${OUTCOME_EVENT_SQL_LIST}) GROUP BY 1,2,3,4,5`, [organizationId, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT ${eventName} event_name, (payload_json ->> '$.value.basis') basis, (payload_json ->> '$.value.currency') currency,
        COUNT(*) events, SUM(payload_json ->> '$.value.amount_minor') value_minor, SUM(payload_json ->> '$.value.collected_minor') collected_minor, COUNT(payload_json ->> '$.value.collected_minor') collected_events
      FROM analytics_events WHERE ${inRange} AND json_type(payload_json, '$.value.amount_minor') IS 'integer'
      GROUP BY 1,2,3 ORDER BY event_name, currency`, [organizationId, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT ${snapshot}, (payload_json ->> '$.value.currency') currency,
        SUM(${eventName} = 'purchase') purchases,
        COALESCE(SUM(CASE WHEN ${eventName} = 'purchase' THEN payload_json ->> '$.value.collected_minor' END), 0) collected,
        COALESCE(SUM(CASE WHEN ${eventName} = 'refund' THEN payload_json ->> '$.value.collected_minor' END), 0) refunded
      FROM analytics_events WHERE ${inRange} AND ${eventName} IN ('purchase', 'refund') GROUP BY 1,2,3,4,5`, [organizationId, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT location_id, (payload_json ->> '$.value.items[0].item_id') product_id, (payload_json ->> '$.value.items[0].item_name') product_name,
        (payload_json ->> '$.value.currency') currency, COUNT(*) bookings, COUNT(payload_json ->> '$.value.amount_minor') valued, COALESCE(SUM(payload_json ->> '$.value.amount_minor'), 0) quoted_minor
      FROM analytics_events WHERE ${inRange} AND ${eventName} = 'booking_submit'
      GROUP BY 1,2,3,4 ORDER BY bookings DESC, product_name`, [organizationId, start, end]),
    queryAll<Record<string, unknown>>(db, `${signups}
      SELECT source, medium, campaign, content, COUNT(*) signups,
        SUM(${followedBy('o', "(o.payload_json ->> '$.event_name') = 'onboarding_complete'")}) onboarded,
        SUM(${followedBy('p', "(p.payload_json ->> '$.event_name') = 'purchase' AND (p.payload_json ->> '$.metadata.purchase_type') = 'initial_subscription'")}) first_paid
      FROM signups GROUP BY 1,2,3,4 ORDER BY signups DESC`, [organizationId, start, end, organizationId, observedEnd, organizationId, observedEnd]),
    queryAll<Record<string, unknown>>(db, `${signups}
      SELECT signups.source, signups.medium, signups.campaign, signups.content, (v.payload_json ->> '$.value.currency') currency,
        COALESCE(SUM(CASE WHEN (v.payload_json ->> '$.event_name') = 'purchase' THEN v.payload_json ->> '$.value.collected_minor' END), 0) collected,
        COALESCE(SUM(CASE WHEN (v.payload_json ->> '$.event_name') = 'refund' THEN v.payload_json ->> '$.value.collected_minor' END), 0) refunded
      FROM signups JOIN analytics_events v ON v.kind = 'conversion' AND v.organization_id = ? AND (v.payload_json ->> '$.event_name') IN ('purchase', 'refund')
        AND (v.payload_json ->> '$.metadata.originating_user_id') = signups.user_id AND v.created_at >= signups.signed_at AND v.created_at < ?
      GROUP BY 1,2,3,4,5`, [organizationId, start, end, organizationId, observedEnd]),
    queryFirst<Record<string, unknown>>(db, `SELECT
        (SELECT COUNT(DISTINCT payload_json ->> '$.entity_id') FROM analytics_events WHERE ${inRange} AND ${eventName} = 'onboarding_complete') onboarded,
        (SELECT COUNT(DISTINCT payload_json ->> '$.metadata.subscribing_organization_id') FROM analytics_events WHERE ${inRange} AND ${eventName} = 'purchase'
          AND (payload_json ->> '$.metadata.purchase_type') = 'initial_subscription') first_paid`, [organizationId, start, end, organizationId, start, end]),
    queryFirst<Record<string, unknown>>(db, `SELECT
        (SELECT MIN(created_at) FROM analytics_events WHERE kind = 'conversion' AND organization_id = ? AND json_type(payload_json, '$.surface') IS 'text') started_at,
        (SELECT COUNT(*) FROM analytics_events WHERE ${inRange} AND json_type(payload_json, '$.attribution.source') IS NOT 'text'
          AND ${eventName} IN (${OUTCOME_EVENT_SQL_LIST})) unattributed`, [organizationId, organizationId, start, end]),
    queryAll<Record<string, unknown>>(db, `SELECT ${eventName} event_name, COALESCE(payload_json ->> '$.ga4_delivery.status', 'unrecorded') status, COUNT(*) count FROM analytics_events
      WHERE ${inRange} AND ${eventName} IN (${SERVER_DELIVERED_EVENT_SQL_LIST})
      GROUP BY 1,2 ORDER BY event_name, status`, [organizationId, start, end]),
  ])
  const text = (value: unknown) => value ? String(value) : null
  const cohortRevenue = (row: Record<string, unknown>) => cohortRevenueRows
    .filter(revenue => revenue.source === row.source && revenue.medium === row.medium && revenue.campaign === row.campaign && revenue.content === row.content)
    .map(revenue => ({ currency: String(revenue.currency), collectedMinor: n(revenue.collected), refundedMinor: n(revenue.refunded), netMinor: n(revenue.collected) - n(revenue.refunded) }))
  return {
    outcomeAttribution: outcomeRows.map(row => ({ source: String(row.source), medium: String(row.medium), campaign: text(row.campaign), content: text(row.content), eventName: String(row.event_name), events: n(row.events), distinctEntities: n(row.entities) })),
    attributedValue: attributedRows.map(row => ({ source: text(row.source), medium: text(row.medium), campaign: text(row.campaign), content: text(row.content), currency: String(row.currency),
      purchases: n(row.purchases), collectedMinor: n(row.collected), refundedMinor: n(row.refunded), netMinor: n(row.collected) - n(row.refunded) })),
    conversions: conversionRows.map(row => ({
      eventName: String(row.event_name), stage: String(row.stage), conversionType: text(row.conversion_type),
      events: n(row.events), distinctEntities: n(row.entities), convertingSessions: n(row.sessions), nonbrowserEvents: n(row.nonbrowser),
      sessionConversionRate: rate(n(row.sessions), uniqueSessions),
    })),
    values: valueRows.map(row => ({
      eventName: String(row.event_name), basis: row.basis as 'quoted' | 'purchase' | 'refund', currency: String(row.currency), events: n(row.events),
      valueMinor: n(row.value_minor), collectedMinor: n(row.collected_events) > 0 ? n(row.collected_minor) : null,
    })),
    bookingValue: bookingValueRows.map(row => ({
      productId: text(row.product_id), productName: text(row.product_name), locationId: text(row.location_id), currency: text(row.currency),
      bookings: n(row.bookings), valuedBookings: n(row.valued), quotedValueMinor: n(row.quoted_minor),
    })),
    net: netByCurrency(valueRows),
    signupCohort: {
      observedThrough: observedEnd,
      signups: cohortRows.reduce((sum, row) => sum + n(row.signups), 0),
      onboardedSignups: cohortRows.reduce((sum, row) => sum + n(row.onboarded), 0),
      firstPaidSignups: cohortRows.reduce((sum, row) => sum + n(row.first_paid), 0),
      bySignupAttribution: cohortRows.map(row => ({
        source: text(row.source), medium: text(row.medium), campaign: text(row.campaign), content: text(row.content),
        signups: n(row.signups), onboardedSignups: n(row.onboarded), firstPaidSignups: n(row.first_paid), revenue: cohortRevenue(row),
      })),
      onboardedBusinesses: n(businessStats?.onboarded),
      firstPaidBusinesses: n(businessStats?.first_paid),
    },
    coverage: {
      measurementContractStartedAt: text(coverageRows?.started_at),
      outcomeEventsWithoutAttribution: n(coverageRows?.unattributed),
      ga4Delivery: deliveryRows.map(row => ({ eventName: String(row.event_name), status: String(row.status), count: n(row.count) })),
    },
  }
}

function netByCurrency(valueRows: Array<Record<string, unknown>>): AnalyticsReport['net'] {
  const byCurrency = new Map<string, { collectedMinor: number; refundedMinor: number }>()
  for (const row of valueRows) {
    if (row.basis !== 'purchase' && row.basis !== 'refund') continue
    const entry = byCurrency.get(String(row.currency)) ?? { collectedMinor: 0, refundedMinor: 0 }
    // Cash both ways, tax included: the tax-exclusive value of a refund is not what was returned.
    if (row.basis === 'purchase') entry.collectedMinor += n(row.collected_minor)
    else entry.refundedMinor += n(row.collected_minor)
    byCurrency.set(String(row.currency), entry)
  }
  return Array.from(byCurrency, ([currency, entry]) => ({ currency, ...entry, netMinor: entry.collectedMinor - entry.refundedMinor }))
}

export async function getAnalyticsReport(db: DbClient, input: {
  organizationId: string; startDate?: string; endDate?: string; now?: Date; env?: CloudflareEnv
  facebookCursor?: string; instagramCursor?: string
}): Promise<AnalyticsReport> {
  const now = input.now ?? new Date()
  const context = await resolveOrganizationAnalyticsContext(db, input.organizationId)
  const range = parseAnalyticsRange({ startDate: input.startDate, endDate: input.endDate, timeZone: context.timezone, now })
  const { start } = localDateBounds(range.startDate, context.timezone)
  const { end } = localDateBounds(range.endDate, context.timezone)
  const nowIso = now.toISOString()
  const observedEnd = end < nowIso ? end : nowIso
  const cutoffDate = context.analyticsDataStartAt ? localDateAt(new Date(context.analyticsDataStartAt), context.timezone) : null
  const [social, slices, sessionStats, returningStats, attributionRows] = await Promise.all([
    input.env ? readMetaInsights(input.env, input.organizationId, {
      start, end,
      previous: {
        start: localDateBounds(range.previousStartDate, context.timezone).start,
        end: localDateBounds(addLocalDays(range.previousEndDate, 1), context.timezone).start,
      },
    }, now, { facebook: input.facebookCursor, instagram: input.instagramCursor }) : undefined,
    loadSlices(db, input.organizationId, range.dates, context.timezone, now, cutoffDate),
    queryFirst<Record<string, unknown>>(db, `SELECT COUNT(*) sessions, COUNT(DISTINCT visitor_id) visitors,
      COALESCE(ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END)), 0) avg_duration
      FROM (${sessionFactsSql}) WHERE organization_id = ? AND started_at < ? AND last_seen_at >= ?`, [input.organizationId, end, start]),
    queryFirst<{ count: number }>(db, `SELECT COUNT(DISTINCT current.visitor_id) count FROM (${sessionFactsSql}) current
      WHERE current.organization_id = ? AND current.started_at < ? AND current.last_seen_at >= ?
      AND EXISTS (SELECT 1 FROM (${sessionFactsSql}) previous WHERE previous.organization_id = current.organization_id
        AND previous.visitor_id = current.visitor_id AND previous.session_id <> current.session_id
        AND previous.started_at < ?)`, [input.organizationId, end, start, start]),
    // Sessions and their converting sessions are counted over the same population: each session
    // grouped by its current last touch, converting when it has an outcome event in the range.
    queryAll<Record<string, unknown>>(db, `SELECT source, medium, campaign, content, COUNT(*) sessions,
        SUM(EXISTS (SELECT 1 FROM analytics_events e WHERE e.kind = 'conversion' AND e.organization_id = facts.organization_id AND e.session_id = facts.session_id
          AND e.created_at >= ? AND e.created_at < ? AND (e.payload_json ->> '$.event_name') IN (${OUTCOME_EVENT_SQL_LIST}))) converting,
        COALESCE(SUM((SELECT COUNT(*) FROM analytics_events e WHERE e.kind = 'conversion' AND e.organization_id = facts.organization_id AND e.session_id = facts.session_id
          AND e.created_at >= ? AND e.created_at < ? AND (e.payload_json ->> '$.event_name') IN (${OUTCOME_EVENT_SQL_LIST}))), 0) outcome_events
      FROM (${sessionFactsSql}) facts WHERE organization_id = ? AND started_at < ? AND last_seen_at >= ? GROUP BY 1,2,3,4`, [start, end, start, end, input.organizationId, end, start]),
  ])
  const pageViews = slices.reduce((sum, slice) => sum + slice.pageViews, 0)
  const uniqueSessions = n(sessionStats?.sessions)
  const conversionReport = await loadConversionReport(db, input.organizationId, { start, end, observedEnd, uniqueSessions })
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
  const percent = (views: number) => pageViews ? Math.round(views / pageViews * 100) : 0
  const dimensionRows = (name: string) => Array.from(dimensionMaps.get(name) ?? []).map(([key, views]) => {
    const [value, subvalue = ''] = key.split('\u0000')
    return { value: value!, subvalue, views }
  }).sort((a, b) => b.views - a.views)

  return {
    ...(social ? { social } : {}),
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
      return { source: String(row.source), medium: String(row.medium), campaign: row.campaign ? String(row.campaign) : null, content: row.content ? String(row.content) : null,
        sessions, outcomeEvents: n(row.outcome_events), convertingSessions: n(row.converting), sessionConversionRate: rate(n(row.converting), sessions) }
    }).sort((a, b) => b.sessions - a.sessions),
    ...conversionReport,
    countries: dimensionRows('country').slice(0, 12).map(row => ({ country: row.value, countryCode: row.value, views: row.views, percentOfTotal: percent(row.views) })),
    cities: dimensionRows('city').slice(0, 10).map(row => {
      const [region, countryCode = 'XX'] = row.subvalue.split('|')
      return { city: row.value, region: region || null, countryCode, views: row.views }
    }),
    referrers: dimensionRows('referrer').slice(0, 10).map(row => ({ source: row.value, views: row.views, percentOfTotal: percent(row.views) })),
    devices: dimensionRows('device').map(row => ({ type: row.value, views: row.views, percentOfTotal: percent(row.views) })),
  }
}

export async function aggregatePreviousLocalDateForAllOrganizations(db: DbClient, now = new Date()): Promise<string[]> {
  const organizations = await queryAll<{ id: string; timezone: string | null }>(db, `SELECT s.id, json_extract(s.settings_json, '$.config.default_timezone') AS timezone FROM organization s WHERE s.status = 'active'`)
  const aggregated: string[] = []
  for (const organization of organizations) {
    if (!isValidTimezone(organization.timezone)) throw new Error(`Organization ${organization.id} default_timezone is missing or invalid`)
    const timezone = organization.timezone
    const date = addLocalDays(localDateAt(now, timezone), -1)
    await aggregateOrganizationAnalyticsDate(db, organization.id, date)
    aggregated.push(`${organization.id}:${date}`)
  }
  return aggregated
}

export async function cleanupTenantAnalytics(db: DbClient, now = new Date()): Promise<number> {
  const rawCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString()
  const retainedCutoff = new Date(now.getTime() - 740 * 86_400_000).toISOString()
  const organizations = await queryAll<{ id: string; timezone: string | null }>(db, `
    SELECT s.id, json_extract(s.settings_json, '$.config.default_timezone') AS timezone FROM organization s
  `)
  const initialResults = await executeBatch(db, [
    { query: "DELETE FROM analytics_events WHERE kind = 'pageview' AND created_at < ?", params: [rawCutoff] },
    { query: "DELETE FROM analytics_summaries WHERE kind = 'session' AND (payload_json ->> '$.last_seen_at') < ?", params: [retainedCutoff] },
  ], { operation: 'clean retained tenant analytics events and sessions' })
  let changes = initialResults.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0)
  for (const organization of organizations) {
    if (!isValidTimezone(organization.timezone)) throw new Error(`Organization ${organization.id} default_timezone is missing or invalid`)
    const timezone = organization.timezone
    const retainedDate = addLocalDays(localDateAt(now, timezone), -739)
    const results = await executeBatch(db, [
      { query: "DELETE FROM analytics_summaries WHERE organization_id = ? AND kind IN ('organization_day', 'page_day', 'dimension_day') AND date < ?", params: [organization.id, retainedDate] },
    ], { operation: `clean retained tenant analytics aggregates for ${organization.id}` })
    changes += results.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0)
  }
  return changes
}
