import { processCashBillingReminders } from '~/server/utils/cash-billing-reminders'

export default defineTask({
  meta: {
    name: 'cash-billing-reminders',
    description: 'Send payment reminders for cash-paying clients and notify admin to collect',
  },
  async run({ context }) {
    const taskContext = context as { cloudflare?: { env?: Record<string, unknown> } } | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB as D1Database | undefined
    if (!db && import.meta.dev) {
      return { result: { reminded: 0, checked: 0, skipped: 'DB unavailable in local scheduled task context' } }
    }
    if (!db) throw new Error('DB is required')

    const result = await processCashBillingReminders(env, db)
    return { result }
  },
})
