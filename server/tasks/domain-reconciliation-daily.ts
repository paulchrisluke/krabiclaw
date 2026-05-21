import { reconcileDueDomains } from '~/server/utils/domains'

interface ReconciliationTaskEnv {
  DB?: ApiValue
  CF_ZONE_ID?: string
  CF_CUSTOM_HOSTNAMES_API_TOKEN?: string
  CF_SAAS_CNAME_TARGET?: string
}

interface ReconciliationTaskContext {
  cloudflare?: {
    env?: ReconciliationTaskEnv
  }
}

export default defineTask({
  meta: {
    name: 'domains:reconcile-daily',
    description: 'Daily Cloudflare SaaS custom domain reconciliation sweep'
  },
  async run({ context }) {
    const taskContext = context as ReconciliationTaskContext | undefined
    const env = taskContext?.cloudflare?.env
    const db = env?.DB
    if (!db && import.meta.dev) {
      return { result: { checked: 0, failed: 0, skipped: 'DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('DB is required')

    const missingKeys: string[] = []
    if (!env?.CF_ZONE_ID) missingKeys.push('CF_ZONE_ID')
    if (!env?.CF_CUSTOM_HOSTNAMES_API_TOKEN) missingKeys.push('CF_CUSTOM_HOSTNAMES_API_TOKEN')
    if (!env?.CF_SAAS_CNAME_TARGET) missingKeys.push('CF_SAAS_CNAME_TARGET')

    if (missingKeys.length > 0) {
      console.error('domains_reconcile_daily_missing_env', { missingKeys })
      return {
        result: {
          checked: 0,
          failed: 0,
          skipped: `Missing required env: ${missingKeys.join(', ')}`
        }
      }
    }

    const result = await reconcileDueDomains(env, db, 200)
    return { result }
  }
})
