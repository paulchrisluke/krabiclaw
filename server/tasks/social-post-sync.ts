import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { syncAllSocialPosts } from '~/server/utils/social-sync'
import type { CloudflareEnv } from '~/server/utils/auth'

/**
 * Hourly read of each Growth organization's Facebook Page and Instagram
 * account into its website posts — the same coordinator `sync_social_posts`
 * runs. It is a provider read, not a publishing clock: it never sends anything.
 * Each connection reports its own progress on its integration; the run fails
 * when any did, so the cron record says so too.
 */
export default defineScheduledTask({
  meta: { name: 'social-post-sync', description: 'Hourly read of Facebook and Instagram posts for eligible Growth organizations' },
  async run({ context }) {
    const env = ((context as { cloudflare?: { env?: ApiRecord } } | undefined)?.cloudflare?.env ?? {}) as CloudflareEnv
    if (!env.DB && import.meta.dev) return { result: { connections: 0, details: [] } }
    if (!env.DB) throw new Error('DB is required')
    const details = await syncAllSocialPosts(env)
    const failed = details.filter(detail => detail.status === 'failed' || detail.errors.length > 0)
    if (failed.length) {
      throw new Error(`Social post sync failed for ${failed.length} of ${details.length} connections: ${failed.map(detail => `${detail.organization_id}/${detail.channel}: ${detail.errors.map(error => `${error.item ?? 'connection'} ${error.message}`).join('; ')}`).join(' | ')}`)
    }
    return { result: { connections: details.length, details } }
  },
})
