import { processSiteTransferReminders } from '~/server/utils/site-transfer'

export default defineTask({
  meta: {
    name: 'site-transfer-reminders',
    description: 'Send pending handoff reminders and pause unpaid custom domains when needed'
  },
  async run({ context }) {
    const taskContext = context as { cloudflare?: { env?: ApiRecord } } | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB
    if (!db && import.meta.dev) {
      return { result: { reminded: 0, paused_domains: 0, checked: 0, skipped: 'DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('DB is required')

    const result = await processSiteTransferReminders(env, db)
    return { result }
  }
})
