import { refreshMemberBusy } from '~/server/domain/member-scheduling'
import { queryAll } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { runCalendarCleanupJobs, syncCalendarOrganization } from '~/server/utils/google-calendar'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

export default defineScheduledTask({
  meta: { name: 'google-calendar-sync', description: 'Reconcile committed bookings and retained Calendar cleanup intents' },
  async run({ context }) {
    const env = (context as { cloudflare: { env: CloudflareEnv } }).cloudflare.env
    const cleanup = await runCalendarCleanupJobs(env)
    const selected = await queryAll<{member_id:string}>(env.DB, "SELECT member_id FROM member_scheduling WHERE calendar_account_id IS NOT NULL ORDER BY COALESCE(busy_checked_at,'') LIMIT 10")
    const busyFailures = []
    for (const member of selected) { const result=await refreshMemberBusy(env.DB,env,member.member_id,true); if(result?.error)busyFailures.push(result.error) }
    const organizations = await queryAll<{ id: string }>(env.DB, "SELECT id FROM organization WHERE json_extract(integrations_json, '$.google_calendar') IS NOT NULL")
    const results = []
    for (const organization of organizations) results.push(await syncCalendarOrganization(env, organization.id))
    if(busyFailures.length) throw new Error(busyFailures.join('; '))
    if (cleanup.failed) throw new Error(`${cleanup.failed} retained Google Calendar cleanup job(s) remain unresolved; inspect google_calendar_cleanup_jobs.last_error`)
    return { result: { cleanup, organizations: results } }
  },
})
