import type { CloudflareEnv } from '~/server/utils/auth'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { sweepScheduledDeletions } from '~/server/utils/tenant-deletion'

interface DeletionSweepTaskContext {
  cloudflare?: { env?: CloudflareEnv }
}

export default defineScheduledTask({
  meta: {
    name: 'tenants:deletion-sweep',
    description: 'Delete the accounts and organizations whose deletion grace period has passed',
  },
  async run({ context }) {
    const env = (context as DeletionSweepTaskContext | undefined)?.cloudflare?.env
    if (!env?.DB && import.meta.dev) {
      return { result: { organizations: 0, users: 0, skipped: ['DB unavailable in local scheduled task context'] } }
    }
    if (!env?.DB) throw new Error('DB is required')

    const result = await sweepScheduledDeletions(env)
    if (result.organizations || result.users || result.skipped.length) {
      console.log('tenant_deletion_sweep', result)
    }
    return { result }
  },
})
