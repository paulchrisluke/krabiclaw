import type { H3Event } from 'h3'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

export async function getNotificationAccess(event: H3Event) {
  const context = await getDashboardContext(event, { requireSite: false })
  const platformAdmin = isPlatformAdmin(context.session.user as { role?: string | null; email?: string | null }, context.env)
  const organizationWide = isOrganizationWideRole(context.organization.role)

  const clauses = [
    `n.channel = 'dashboard'`,
    `n.event_type IS NOT NULL`,
    `(n.target_user_id IS NULL OR n.target_user_id = ?)`,
  ]
  const params: unknown[] = [context.userId]

  const tenantClause = organizationWide
    ? `(n.scope IN ('organization', 'site') AND n.organization_id = ?)`
    : `(n.scope IN ('organization', 'site') AND n.organization_id = ? AND (
        n.scope = 'organization' OR EXISTS (
          SELECT 1 FROM member_access_scope mas
          WHERE mas.member_id = ?
            AND mas.organization_id = n.organization_id
            AND mas.site_id = n.site_id
        )
      ))`
  params.push(context.organization.id)
  if (!organizationWide) params.push(context.organization.memberId)

  clauses.push(platformAdmin ? `(n.scope = 'platform' OR ${tenantClause})` : tenantClause)

  return {
    ...context,
    whereSql: clauses.join(' AND '),
    whereParams: params,
  }
}
