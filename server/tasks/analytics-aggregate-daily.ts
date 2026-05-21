import { aggregateAnalyticsForAllSites, cleanupOldPageviewEvents } from '~/server/utils/analytics'

export default defineTask({
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
      // Aggregate analytics for yesterday (previous day)
      const [yesterday] = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')
      const targetDate = yesterday || new Date().toISOString().slice(0, 10)
      await aggregateAnalyticsForAllSites(db, targetDate)

      // Clean up pageview events older than 90 days (keep daily aggregates)
      const cleaned = await cleanupOldPageviewEvents(db, 90)

      return {
        result: {
          aggregated: targetDate,
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
