import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { reconcileZarazAnalytics } from '~/server/utils/zaraz-analytics'

interface ZarazReconciliationEnv extends ApiRecord {
  DB?: D1Database
  CF_ZONE_ID?: string
  CLOUDFLARE_API_TOKEN?: string
}

export default defineScheduledTask({
  meta: {
    name: 'analytics:reconcile-zaraz',
    description: 'Reconcile active GA4 connections with the canonical Zaraz configuration',
  },
  async run({ context }) {
    const taskContext = context as { cloudflare?: { env?: ZarazReconciliationEnv } } | undefined
    const env = taskContext?.cloudflare?.env
    const db = env?.DB
    if (!db && import.meta.dev) {
      return { result: { configuredTenants: 0, removedAnalyticsTools: 0, updated: false, skipped: 'DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('DB is required')

    const missingKeys = [
      !env?.CF_ZONE_ID ? 'CF_ZONE_ID' : null,
      !env?.CLOUDFLARE_API_TOKEN ? 'CLOUDFLARE_API_TOKEN' : null,
    ].filter((key): key is string => Boolean(key))
    if (missingKeys.length) {
      return {
        result: {
          configuredTenants: 0,
          removedAnalyticsTools: 0,
          updated: false,
          skipped: `Missing required env: ${missingKeys.join(', ')}`,
        },
      }
    }

    return { result: await reconcileZarazAnalytics(env, db) }
  },
})
