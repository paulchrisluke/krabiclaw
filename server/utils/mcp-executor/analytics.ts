import type { McpExecutorContext } from './shared'
import { NOT_HANDLED, optionalString } from './shared'
import { getSiteAnalyticsReport } from '~/server/utils/site-analytics-report'

export async function handleAnalyticsTools(ctx: McpExecutorContext): Promise<unknown> {
  if (ctx.toolName !== 'get_organization_analytics') return NOT_HANDLED
  return await getSiteAnalyticsReport(ctx.site.db, {
    organizationId: ctx.site.organizationId,
    startDate: optionalString(ctx.args, 'start_date') ?? undefined,
    endDate: optionalString(ctx.args, 'end_date') ?? undefined,
  })
}
