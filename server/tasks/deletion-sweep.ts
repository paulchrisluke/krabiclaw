import type { CloudflareEnv } from '~/server/utils/auth'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { expireStripeGa4Intents } from '~/server/utils/stripe-ga4-intents'
import { sweepScheduledDeletions } from '~/server/utils/tenant-deletion'

interface DeletionSweepTaskContext {
  cloudflare?: { env?: CloudflareEnv }
}

export default defineScheduledTask({
  meta: {
    name: 'tenants:deletion-sweep',
    description: 'Delete the accounts and organizations whose deletion grace period has passed, and retire expired Stripe GA4 analytics intents',
  },
  async run({ context }) {
    const env = (context as DeletionSweepTaskContext | undefined)?.cloudflare?.env
    if (!env?.DB && import.meta.dev) {
      return { result: { organizations: 0, users: 0, skipped: ['DB unavailable in local scheduled task context'] } }
    }
    if (!env?.DB) throw new Error('DB is required')

    // GA4 analytics intents are read with an `expires_at > now` filter, so this
    // sweep is retention only: it marks lapsed intents expired and drops
    // consumed ones past the 90-day window. It rode on the hourly Stripe
    // reconciliation task before that task and the billing layer it reconciled
    // were deleted; the daily tenant sweep is the only remaining retention job.
    await expireStripeGa4Intents(env.DB)
    const result = await sweepScheduledDeletions(env)
    if (result.organizations || result.users || result.skipped.length) {
      console.log('tenant_deletion_sweep', result)
    }
    return { result }
  },
})
