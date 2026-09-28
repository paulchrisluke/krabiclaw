import { aggregatePreviousLocalDateForAllOrganizations, cleanupTenantAnalytics } from '~/server/utils/analytics-report'
import { cleanupMcpToolCallEvents } from '~/server/utils/mcp-telemetry'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

export default defineScheduledTask({
  meta: {
    name: 'analytics:aggregate-daily',
    description: 'Daily aggregation of site pageview events into analytics summary, and analytics and MCP telemetry retention cleanup'
  },
  async run({ context }) {
    const taskContext = context as { cloudflare?: { env?: ApiRecord } } | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env?.DB

    if (!db && import.meta.dev) {
      return {
        result: {
          aggregated: '',
          cleaned: 0,
          mcpToolCallEventsCleaned: 0,
          skipped: 'DB unavailable in local scheduled task context',
          message: 'Skipped analytics aggregation in dev mode',
          error: ''
        }
      }
    }

    if (!db) throw new Error('DB is required')

    try {
      const aggregated = await aggregatePreviousLocalDateForAllOrganizations(db)
      const cleaned = await cleanupTenantAnalytics(db)
      const mcpToolCallEventsCleaned = await cleanupMcpToolCallEvents(db)

      return {
        result: {
          aggregated: aggregated.join(','),
          cleaned,
          mcpToolCallEventsCleaned,
          skipped: '',
          message: 'Analytics aggregation completed successfully',
          error: ''
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('Analytics aggregation task failed:', {
        message: err.message,
        stack: err.stack
      })
      throw err
    }
  }
})
