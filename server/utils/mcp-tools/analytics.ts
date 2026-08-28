import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

const number = { type: 'number' } as const
const string = { type: 'string' } as const
const nullableString = { type: ['string', 'null'] } as const

export const ANALYTICS_TOOLS: McpToolDefinition[] = [
  siteTool({
    name: 'get_site_analytics',
    description: 'Get the canonical read-only traffic, attribution, and conversion report for the site. Dates are inclusive in the site reporting timezone and default to exactly 30 calendar dates.',
    domain: 'analytics',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      start_date: { type: 'string', description: 'Inclusive local start date in YYYY-MM-DD format. Defaults to 29 days before end_date.' },
      end_date: { type: 'string', description: 'Inclusive local end date in YYYY-MM-DD format. Defaults to today.' },
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
        attribution: { type: 'array', items: { type: 'object', properties: { source: string, medium: string, campaign: nullableString, sessions: number, conversions: number, conversionRate: number }, required: ['source', 'medium', 'campaign', 'sessions', 'conversions', 'conversionRate'] } },
        conversions: { type: 'array', items: { type: 'object', properties: { eventName: string, stage: string, count: number, conversionRate: number }, required: ['eventName', 'stage', 'count', 'conversionRate'] } },
        countries: { type: 'array', items: { type: 'object', properties: { country: string, countryCode: string, views: number, percentOfTotal: number }, required: ['country', 'countryCode', 'views', 'percentOfTotal'] } },
        cities: { type: 'array', items: { type: 'object', properties: { city: string, region: nullableString, countryCode: string, views: number }, required: ['city', 'region', 'countryCode', 'views'] } },
        referrers: { type: 'array', items: { type: 'object', properties: { source: string, views: number, percentOfTotal: number }, required: ['source', 'views', 'percentOfTotal'] } },
        devices: { type: 'array', items: { type: 'object', properties: { type: string, views: number, percentOfTotal: number }, required: ['type', 'views', 'percentOfTotal'] } },
      },
      required: ['period', 'metrics', 'dailyData', 'topPages', 'attribution', 'conversions', 'countries', 'cities', 'referrers', 'devices'],
    },
  }),
]
