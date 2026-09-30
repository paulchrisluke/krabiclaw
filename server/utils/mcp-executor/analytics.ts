import type { McpExecutorContext } from './shared'
import { NOT_HANDLED, optionalString } from './shared'
import { getAnalyticsReport } from '~/server/utils/analytics-report'
import { AnalyticsQueryError, queryOrganizationAnalytics, type AnalyticsQueryInput } from '~/server/utils/analytics-query'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'

export async function handleAnalyticsTools(ctx: McpExecutorContext): Promise<unknown> {
  if (ctx.toolName === 'query_organization_analytics') {
    const args = ctx.args
    try {
      return await queryOrganizationAnalytics(ctx.organization.db, {
        organizationId: ctx.organization.organizationId,
        mode: optionalString(args, 'mode') as AnalyticsQueryInput['mode'],
        startDate: optionalString(args, 'start_date') ?? undefined,
        endDate: optionalString(args, 'end_date') ?? undefined,
        filters: args.filters as Record<string, unknown> | undefined,
        attributionBasis: optionalString(args, 'attribution_basis') as AnalyticsQueryInput['attributionBasis'] ?? undefined,
        sort: args.sort as AnalyticsQueryInput['sort'],
        limit: args.limit as number | undefined,
        cursor: optionalString(args, 'cursor') ?? undefined,
        dimensions: args.dimensions as string[] | undefined,
        metrics: args.metrics as string[] | undefined,
        outcomeEvent: optionalString(args, 'outcome_event') ?? undefined,
        cursorSecret: ctx.organization.env.BETTER_AUTH_SECRET,
      })
    } catch (error) {
      if (error instanceof AnalyticsQueryError) throw mcpProtocolError(MCP_ERROR.invalidParams, error.message)
      throw error
    }
  }
  if (ctx.toolName !== 'get_organization_analytics') return NOT_HANDLED
  return await getAnalyticsReport(ctx.organization.db, {
    organizationId: ctx.organization.organizationId,
    startDate: optionalString(ctx.args, 'start_date') ?? undefined,
    endDate: optionalString(ctx.args, 'end_date') ?? undefined,
  })
}
