import type { McpToolDefinition } from './shared'
import { organizationTool } from './shared'

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
]
