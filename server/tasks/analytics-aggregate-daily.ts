import { aggregatePreviousLocalDateForAllSites, cleanupTenantAnalytics } from '~/server/utils/site-analytics-report'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

export default defineScheduledTask({
  meta: {
    name: 'analytics:aggregate-daily',
    description: 'Daily aggregation of site pageview events into analytics summary'
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
          skipped: 'DB unavailable in local scheduled task context',
          message: 'Skipped analytics aggregation in dev mode',
          error: ''
        }
      }
    }

    if (!db) throw new Error('DB is required')

    try {
      const aggregated = await aggregatePreviousLocalDateForAllSites(db)
      const cleaned = await cleanupTenantAnalytics(db)

      return {
        result: {
          aggregated: aggregated.join(','),
          cleaned,
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
