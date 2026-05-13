import { reconcileDueDomains } from '~/server/utils/domains'

export default defineTask({
  meta: {
    name: 'domains:reconcile',
    description: 'Reconcile due Cloudflare SaaS custom domains'
  },
  async run({ payload, context }) {
    const env = context?.cloudflare?.env ?? {}
    const db = env.REVIEWS_DB
    if (!db && import.meta.dev) {
      return { result: { checked: 0, failed: 0, skipped: 'REVIEWS_DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('REVIEWS_DB is required')

    const rawLimit = typeof payload?.limit === 'number' ? payload.limit : Number.NaN
    const normalizedLimit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 25
    const limit = Math.min(1000, Math.max(1, normalizedLimit))
    const result = await reconcileDueDomains(env, db, limit)
    return { result }
  }
})
