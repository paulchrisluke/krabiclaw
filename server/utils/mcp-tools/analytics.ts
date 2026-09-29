import type { McpToolDefinition } from './shared'
import { organizationTool } from './shared'
import { ANALYTICS_QUERY_FIELDS, ANALYTICS_QUERY_METRICS } from '~/server/utils/analytics-query'

const number = { type: 'number' } as const
const string = { type: 'string' } as const
const nullableString = { type: ['string', 'null'] } as const
const nullableNumber = { type: ['number', 'null'] } as const
const row = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties) }) as const
const providerMetric = {
  type: 'object',
  properties: {
    name: string, value: { type: ['number', 'null'] }, unit: string,
    period: string, status: string, reason: nullableString,
    previousValue: { type: ['number', 'null'] }, previousStatus: nullableString,
  },
  required: ['name', 'value', 'unit', 'period', 'status', 'reason', 'previousValue', 'previousStatus'],
} as const
const providerReport = {
  type: 'object',
  properties: {
    source: string, apiVersion: string, status: string, targetId: nullableString,
    targetName: nullableString, connectionRevision: nullableString, fetchedAt: nullableString,
    error: nullableString, metrics: { type: 'array', items: providerMetric },
    content: { type: 'array', items: { type: 'object', properties: {
      id: string, kind: string, publishedAt: string, permalink: nullableString,
      caption: nullableString, metrics: { type: 'array', items: providerMetric },
    }, required: ['id', 'kind', 'publishedAt', 'permalink', 'caption', 'metrics'] } },
    contentCoverage: string, contentCoverageReason: nullableString, nextCursor: nullableString,
  },
  required: ['source', 'apiVersion', 'status', 'targetId', 'targetName', 'connectionRevision', 'fetchedAt', 'error', 'metrics', 'content', 'contentCoverage', 'contentCoverageReason', 'nextCursor'],
} as const

export const ANALYTICS_TOOLS: McpToolDefinition[] = [
  organizationTool({
    name: 'get_organization_analytics',
    description: 'Get website traffic, attribution (including campaign content/creative), conversions with session conversion rates, booking and purchase value, revenue by campaign and creative (attributedValue, and per signup cohort), refunds and net by currency, signup-cohort funnel and measurement coverage, plus live Facebook Page and Instagram professional-account insights for the selected organization. Dates are inclusive in the site reporting timezone and default to exactly 30 calendar dates. Each provider returns one newest-first page of native content and a nextCursor; pass facebook_cursor or instagram_cursor to continue. Rank content only among pages fetched, and check each metric status. Do not add unique audiences across providers or treat unavailable as zero. Amounts are minor units per currency and are never summed across currencies; quoted booking value is not revenue, and purchase revenue exists only for verified payments. sessionConversionRate is converting sessions divided by the sessions in the same attribution group, not an event count over sessions; outcomeAttribution groups events by their own attribution snapshot and is a different population. attributedValue/collectedMinor/refundedMinor are cash including tax; value fields are tax-exclusive. signupCohort counts per signup through the organizations that user owns; onboardedBusinesses and firstPaidBusinesses count per organization.',
    domain: 'analytics',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      start_date: { type: 'string', description: 'Inclusive local start date in YYYY-MM-DD format. Defaults to 29 days before end_date.' },
      end_date: { type: 'string', description: 'Inclusive local end date in YYYY-MM-DD format. Defaults to today.' },
      facebook_cursor: { type: 'string', description: 'Opaque nextCursor from the previous Facebook result for this same selected date range and connection.' },
      instagram_cursor: { type: 'string', description: 'Opaque nextCursor from the previous Instagram result for this same selected date range and connection.' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'object',
          properties: {
            startDate: string,
            endDate: string,
            timezone: string,
            analyticsDataStartAt: nullableString,
          },
          required: ['startDate', 'endDate', 'timezone', 'analyticsDataStartAt'],
        },
        metrics: {
          type: 'object',
          properties: {
            pageViews: number,
            uniqueSessions: number,
            uniqueVisitors: number,
            returningVisitors: number,
            avgSessionDuration: number,
            pagesPerSession: number,
            changePercent: { type: ['number', 'null'] },
          },
          required: ['pageViews', 'uniqueSessions', 'uniqueVisitors', 'returningVisitors', 'avgSessionDuration', 'pagesPerSession', 'changePercent'],
        },
        dailyData: { type: 'array', items: { type: 'object', properties: { date: string, pageViews: number, sessions: number, avgDuration: number }, required: ['date', 'pageViews', 'sessions', 'avgDuration'] } },
        topPages: { type: 'array', items: { type: 'object', properties: { path: string, views: number, percentOfTotal: number }, required: ['path', 'views', 'percentOfTotal'] } },
        attribution: { type: 'array', items: row({ source: string, medium: string, campaign: nullableString, content: nullableString, sessions: number, outcomeEvents: number, convertingSessions: number, sessionConversionRate: nullableNumber }) },
        outcomeAttribution: { type: 'array', items: row({ source: string, medium: string, campaign: nullableString, content: nullableString, eventName: string, events: number, distinctEntities: number }) },
        attributedValue: { type: 'array', items: row({ source: nullableString, medium: nullableString, campaign: nullableString, content: nullableString, currency: string, purchases: number, collectedMinor: number, refundedMinor: number, netMinor: number }) },
        conversions: { type: 'array', items: row({ eventName: string, stage: string, conversionType: nullableString, events: number, distinctEntities: number, convertingSessions: number, nonbrowserEvents: number, sessionConversionRate: nullableNumber }) },
        values: { type: 'array', items: row({ eventName: string, basis: { type: 'string', enum: ['quoted', 'purchase', 'refund'] }, currency: string, events: number, valueMinor: number, collectedMinor: nullableNumber }) },
        bookingValue: { type: 'array', items: row({ productId: nullableString, productName: nullableString, locationId: nullableString, currency: nullableString, bookings: number, valuedBookings: number, quotedValueMinor: number }) },
        net: { type: 'array', items: row({ currency: string, collectedMinor: number, refundedMinor: number, netMinor: number }) },
        signupCohort: row({
          observedThrough: string, signups: number, onboardedSignups: number, firstPaidSignups: number,
          bySignupAttribution: { type: 'array', items: row({ source: nullableString, medium: nullableString, campaign: nullableString, content: nullableString, signups: number, onboardedSignups: number, firstPaidSignups: number, revenue: { type: 'array', items: row({ currency: string, collectedMinor: number, refundedMinor: number, netMinor: number }) } }) },
          onboardedBusinesses: number, firstPaidBusinesses: number,
        }),
        coverage: row({
          measurementContractStartedAt: nullableString, outcomeEventsWithoutAttribution: number,
          retention: row({ pageviewDetailDays: number, pageviewDetailAvailableFrom: string, summaryDays: number, rangeDetailComplete: { type: 'boolean' } }),
          ga4Delivery: { type: 'array', items: row({ eventName: string, status: string, count: number }) },
        }),
        countries: { type: 'array', items: { type: 'object', properties: { country: string, countryCode: string, views: number, percentOfTotal: number }, required: ['country', 'countryCode', 'views', 'percentOfTotal'] } },
        cities: { type: 'array', items: { type: 'object', properties: { city: string, region: nullableString, countryCode: string, views: number }, required: ['city', 'region', 'countryCode', 'views'] } },
        referrers: { type: 'array', items: { type: 'object', properties: { source: string, views: number, percentOfTotal: number }, required: ['source', 'views', 'percentOfTotal'] } },
        devices: { type: 'array', items: { type: 'object', properties: { type: string, views: number, percentOfTotal: number }, required: ['type', 'views', 'percentOfTotal'] } },
        social: { type: 'object', properties: { facebook: providerReport, instagram: providerReport }, required: ['facebook', 'instagram'] },
      },
      required: ['period', 'metrics', 'dailyData', 'topPages', 'attribution', 'outcomeAttribution', 'attributedValue', 'conversions', 'values', 'bookingValue', 'net', 'signupCohort', 'coverage', 'countries', 'cities', 'referrers', 'devices', 'social'],
    },
  }),
  organizationTool({
    name: 'query_organization_analytics',
    description: 'Query the complete native analytics record of the selected organization: individual events (pageviews, business outcomes, interactions) with every observation the collector kept, retained sessions, or complete grouped breakdowns over the whole filtered population. Reads the same native store as get_organization_analytics and the CMS; nothing is sampled or top-N. Dates are inclusive local dates in the site timezone (default: the last 30 days, at most 365). mode=events lists events; mode=sessions lists retained session records (derived last touch); mode=breakdown groups by 1-6 dimensions and returns the requested metrics; mode=daily_summaries pages through the retained daily summary rows (filters.summary_kind organization_day, page_day or dimension_day) at their own grain, complete and not top-N, including days older than the 90 days of raw pageview detail; each row is a summary, never reconstructed events, and coverage.summary_source names its grain and supported metrics. filters narrow the population by any named field. attribution_basis selects which attribution the source/medium/campaign/content/term/click-id/referrer_host fields read: observed (exactly what the event carried), event_snapshot (the attribution in force for the event when it happened; default) or session_last_touch (the session\'s last touch as of the as_of boundary of the query). Amount metrics require the currency dimension, so currencies are never added together; session_conversion_rate and converting_sessions require outcome_event: eligible sessions are sessions with a pageview in the group and converting sessions are those same sessions that completed the outcome in the range, so the rate never exceeds 100%; filters or dimensions only outcome events carry are rejected for these metrics. Every response returns rows, next_cursor, the resolved query with its as_of boundary, totals over the WHOLE filtered population with named units (distinct sessions and visitors are exact, not summed from groups), and coverage: pageview event detail is retained for 90 days, sessions and daily summaries for 740 days, and events recorded before a fact was collected say so in coverage.missing_dimensions and per-event `missing` instead of reading as zero. To continue, repeat the SAME request with next_cursor; it is bound to this organization, this exact query and the as_of boundary. When next_cursor is null every matching row has been returned.',
    domain: 'analytics',
    minimumRole: 'admin',
    confirmRequired: false,
    required: ['mode'],
    inputSchema: {
      mode: { type: 'string', enum: ['events', 'sessions', 'breakdown', 'daily_summaries'], description: 'events | sessions | breakdown | daily_summaries' },
      start_date: { type: 'string', description: 'Inclusive local start date (YYYY-MM-DD). Defaults to 29 days before end_date.' },
      end_date: { type: 'string', description: 'Inclusive local end date (YYYY-MM-DD). Defaults to today.' },
      filters: {
        type: 'object',
        description: 'Exact-match filters (all must match). path_prefix matches the public path or anything under it. Names are the queryable fields; enumerated ones list their values.',
        additionalProperties: false,
        properties: {
          ...Object.fromEntries(Object.entries(ANALYTICS_QUERY_FIELDS).map(([name, description]) => [name, { type: 'string', description }])),
          path_prefix: { type: 'string', description: 'A public path prefix such as /th/ or /locations/main' },
          summary_kind: { type: 'string', enum: ['organization_day', 'page_day', 'dimension_day'], description: 'daily_summaries only (required): the retained summary grain: one row per day, per day and public page path, or per day and country/city/device/referrer value.' },
          dimension: { type: 'string', enum: ['country', 'city', 'device', 'referrer'], description: 'daily_summaries with dimension_day: the dimension to read.' },
          value: { type: 'string', description: 'daily_summaries with dimension_day: one value of the dimension.' },
          outcome_event: { type: 'string', description: 'The outcome measured by converting_sessions and session_conversion_rate (sign_up, contact_submit, booking_submit, purchase, ...)' },
        },
      },
      attribution_basis: { type: 'string', enum: ['observed', 'event_snapshot', 'session_last_touch'], description: 'Which attribution the attribution fields read. Default event_snapshot (sessions: session_last_touch).' },
      sort: { description: 'events: occurred_at_desc (default) or occurred_at_asc. breakdown: { metric, direction } over a requested metric (default: the first metric, descending). Ties break deterministically.', oneOf: [{ type: 'string', enum: ['occurred_at_desc', 'occurred_at_asc'] }, { type: 'object', additionalProperties: false, properties: { metric: { type: 'string' }, direction: { type: 'string', enum: ['asc', 'desc'] } } }] },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Rows per page (default 50). A page size is not a total-result limit.' },
      cursor: { type: 'string', description: 'next_cursor from the previous page of this same request.' },
      dimensions: { type: 'array', items: { type: 'string', enum: Object.keys(ANALYTICS_QUERY_FIELDS) }, description: 'breakdown only: 1-6 fields to group by.' },
      metrics: { type: 'array', items: { type: 'string', enum: Object.keys(ANALYTICS_QUERY_METRICS) }, description: `breakdown only: 1-8 metrics. ${Object.entries(ANALYTICS_QUERY_METRICS).map(([name, metric]) => `${name} (${metric.unit})`).join('; ')}` },
      outcome_event: { type: 'string', description: 'The outcome measured by converting_sessions and session_conversion_rate.' },
    },
    outputSchema: {
      type: 'object',
      properties: {
        mode: string,
        rows: { type: 'array', items: { type: 'object' } },
        next_cursor: nullableString,
        query: { type: 'object' },
        totals: { type: 'object' },
        coverage: { type: 'object' },
      },
      required: ['mode', 'rows', 'next_cursor', 'query', 'totals', 'coverage'],
    },
  }),
]
