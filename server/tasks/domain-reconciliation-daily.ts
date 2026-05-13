import { reconcileDueDomains } from '~/server/utils/domains'

export default defineTask({
  meta: {
    name: 'domains:reconcile-daily',
    description: 'Daily Cloudflare SaaS custom domain reconciliation sweep'
  },
  async run({ context }) {
    const env = context?.cloudflare?.env ?? {}
    const db = env.REVIEWS_DB
    if (!db && import.meta.dev) {
      return { result: { checked: 0, failed: 0, skipped: 'REVIEWS_DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('REVIEWS_DB is required')

    const result = await reconcileDueDomains(env, db, 200)
    return { result }
  }
})
