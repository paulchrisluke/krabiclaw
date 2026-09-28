import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { reconcileZarazAnalytics, type ZarazEnv } from '~/server/utils/zaraz-analytics'

interface ZarazReconciliationEnv extends ApiRecord, ZarazEnv {
  DB?: D1Database
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
    if (!db) throw new Error('DB is required')

    return { result: await reconcileZarazAnalytics(env, db) }
  },
})
