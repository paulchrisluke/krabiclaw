import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'

export const ANALYTICS_TOOLS: McpToolDefinition[] = [
  // ─── Analytics ────────────────────────────────────────────────────────────────
    siteTool({
      name: 'get_site_analytics',
      description: 'Get traffic analytics for the site: page views, sessions, top pages. Ask "how many visitors this month?" or "what pages are most popular?"',
      domain: 'analytics',
      minimumRole: 'editor',
      confirmRequired: false,
      inputSchema: {
        start_date: { type: 'string', description: 'Start of period in YYYY-MM-DD format. Defaults to 30 days ago.' },
        end_date: { type: 'string', description: 'End of period in YYYY-MM-DD format. Defaults to today.' },
      },
      outputSchema: {
        type: 'object',
        properties: {
          metrics: {
            type: 'object',
            properties: {
              pageViews: { type: 'number' },
              uniqueSessions: { type: 'number' },
              avgSessionDuration: { type: 'number', description: 'Average session duration in seconds.' },
              changePercent: { type: 'number', description: 'Percent change versus the previous equivalent period.' },
            },
            required: ['pageViews', 'uniqueSessions'],
          },
          topPages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                views: { type: 'number' },
                percentOfTotal: { type: 'number' },
              },
            },
          },
          period: {
            type: 'object',
            properties: { startDate: { type: 'string' }, endDate: { type: 'string' } },
          },
        },
        required: ['metrics', 'period'],
      },
    }),
]
