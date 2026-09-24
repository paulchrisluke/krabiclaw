import type { McpExecutorContext } from './shared'
import { NOT_HANDLED, optionalString } from './shared'
import { getAnalyticsReport } from '~/server/utils/analytics-report'

export async function handleAnalyticsTools(ctx: McpExecutorContext): Promise<unknown> {
  if (ctx.toolName !== 'get_organization_analytics') return NOT_HANDLED
  return await getAnalyticsReport(ctx.organization.db, {
    organizationId: ctx.organization.organizationId,
    startDate: optionalString(ctx.args, 'start_date') ?? undefined,
    endDate: optionalString(ctx.args, 'end_date') ?? undefined,
  })
}
