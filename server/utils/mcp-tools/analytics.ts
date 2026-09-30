import type { McpToolDefinition } from './shared'
import { organizationTool } from './shared'
import { ANALYTICS_QUERY_FIELDS, ANALYTICS_QUERY_METRICS } from '~/server/utils/analytics-query'

import { z } from 'zod'
import { analyticsReportSchema } from '~/shared/analytics-report'

const string = { type: 'string' } as const
const nullableString = { type: ['string', 'null'] } as const

export const ANALYTICS_TOOLS: McpToolDefinition[] = [
  organizationTool({
    name: 'get_organization_analytics',
    description: 'Get website traffic, attribution (including campaign content/creative), conversions with session conversion rates, booking and purchase value, revenue by campaign and creative (attributedValue, and per signup cohort), refunds and net by currency, signup-cohort funnel and measurement coverage from the first-party D1 record for the selected organization. Dates are inclusive in the site reporting timezone and default to exactly 30 calendar dates. Amounts are minor units per currency and are never summed across currencies; quoted booking value is not revenue, and purchase revenue exists only for verified payments. sessionConversionRate is converting sessions divided by the sessions in the same attribution group, not an event count over sessions; outcomeAttribution groups events by their own attribution snapshot and is a different population. attributedValue/collectedMinor/refundedMinor are cash including tax; value fields are tax-exclusive. signupCohort counts per signup through the organizations that user owns; onboardedBusinesses and firstPaidBusinesses count per organization.',
    domain: 'analytics',
    minimumRole: 'admin',
    confirmRequired: false,
    inputSchema: {
      start_date: { type: 'string', description: 'Inclusive local start date in YYYY-MM-DD format. Defaults to 29 days before end_date.' },
      end_date: { type: 'string', description: 'Inclusive local end date in YYYY-MM-DD format. Defaults to today.' },
    },
    outputSchema: z.toJSONSchema(analyticsReportSchema),
  }),
  organizationTool({
    name: 'query_organization_analytics',
    description: 'Query the complete native analytics record of the selected organization: individual events (pageviews, business outcomes, interactions) with every observation the collector kept, sessions, or complete grouped breakdowns over the whole filtered population. Reads the same native store as get_organization_analytics and the CMS; nothing is sampled or top-N. Dates are inclusive local dates in the site timezone (default: the last 30 days, at most 365). mode=events lists events; mode=sessions lists session records (derived last touch); mode=breakdown groups by 1-6 dimensions and returns the requested metrics; mode=daily_summaries pages through the daily summary rows (filters.summary_kind organization_day, page_day or dimension_day) at their own grain, complete and not top-N; each row is a derived summary of the native events, never reconstructed events, and coverage.summary_source names its grain and supported metrics. filters narrow the population by any named field. attribution_basis selects which attribution the source/medium/campaign/content/term/click-id/referrer_host fields read: observed (exactly what the event carried), event_snapshot (the attribution in force for the event when it happened; default) or session_last_touch (the session\'s last touch as of the as_of boundary of the query). Amount metrics require the currency dimension, so currencies are never added together; session_conversion_rate and converting_sessions require outcome_event: eligible sessions are sessions with a pageview in the group and converting sessions are those same sessions that completed the outcome in the range, so the rate never exceeds 100%; filters or dimensions only outcome events carry are rejected for these metrics. Every response returns rows, next_cursor, the resolved query with its as_of boundary, totals over the WHOLE filtered population with named units (distinct sessions and visitors are exact, not summed from groups), and coverage: native events are never expired, so the history is everything collected, and events recorded before a fact was collected say so in coverage.missing_dimensions and per-event `missing` instead of reading as zero. To continue, repeat the SAME request with next_cursor; it is bound to this organization, this exact query and the as_of boundary. When next_cursor is null every matching row has been returned.',
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
          summary_kind: { type: 'string', enum: ['organization_day', 'page_day', 'dimension_day'], description: 'daily_summaries only (required): the summary grain: one row per day, per day and public page path, or per day and country/city/device/referrer value.' },
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
