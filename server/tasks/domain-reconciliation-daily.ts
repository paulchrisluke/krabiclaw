import { reconcileDueDomains } from '~/server/utils/domains'

export default defineTask({
  meta: {
    name: 'domains:reconcile-daily',
    description: 'Daily Cloudflare SaaS custom domain reconciliation sweep'
  },
  async run({ context }) {
    const env = {
      ...process.env,
      ...(context?.cloudflare?.env ?? {})
    }
    const db = env.REVIEWS_DB
    if (!db) throw new Error('REVIEWS_DB is required')

    const result = await reconcileDueDomains(env, db, 200)
    return { result }
  }
})
