import { queryAll } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { syncCalendarOrganization } from '~/server/utils/google-calendar'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

export default defineScheduledTask({
  meta: { name: 'google-calendar-sync', description: 'Reconcile committed bookings and retained Calendar cleanup intents' },
  async run({ context }) {
    const env = (context as { cloudflare: { env: CloudflareEnv } }).cloudflare.env
    const organizations = await queryAll<{ id: string }>(env.DB, "SELECT id FROM organization WHERE json_extract(integrations_json, '$.google_calendar') IS NOT NULL")
    const results = []
    for (const organization of organizations) results.push(await syncCalendarOrganization(env, organization.id))
    return { result: results }
  },
})
