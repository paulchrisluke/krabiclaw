import { publishDuePosts } from '~/server/utils/post-management'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

export default defineScheduledTask({
  meta: { name: 'post-scheduled-publish', description: 'Publish due scheduled website posts' },
  async run({ context, payload }): Promise<{ result: { published: number; skipped?: string } }> {
    const db = (context as { cloudflare?: { env?: { DB?: D1Database } } } | undefined)?.cloudflare?.env?.DB
    if (!db && import.meta.dev) return { result: { published: 0, skipped: 'DB unavailable in local scheduled task context' } }
    if (!db) throw new Error('DB is required')
    const scheduledTime = payload && typeof payload === 'object' && 'scheduledTime' in payload
      ? payload.scheduledTime
      : null
    if (typeof scheduledTime !== 'number' || !Number.isFinite(scheduledTime)) {
      throw new Error('scheduledTime is required')
    }
    return { result: await publishDuePosts(db, new Date(scheduledTime)) }
  },
})
