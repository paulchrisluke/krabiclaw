import type { H3Event } from 'h3'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export interface NotificationVisibilityPrincipal {
  userId: string
  platformAdmin: boolean
  organization: {
    id: string
    role: string
    memberId: string
  } | null
}

export function buildNotificationVisibilityFilter(principal: NotificationVisibilityPrincipal) {
  const clauses = [
    `n.channel = 'dashboard'`,
    `n.event_type IS NOT NULL`,
    `(n.target_user_id IS NULL OR n.target_user_id = ?)`,
  ]
  const params: unknown[] = [principal.userId]
  const visibilityClauses: string[] = []

  if (principal.platformAdmin) visibilityClauses.push(`n.scope = 'platform'`)

  if (principal.organization) {
    const organizationWide = isOrganizationWideRole(principal.organization.role)
    if (organizationWide) {
      visibilityClauses.push(`(n.scope IN ('organization', 'site') AND n.organization_id = ?)`)
      params.push(principal.organization.id)
    } else {
      visibilityClauses.push(`(n.scope = 'site' AND n.organization_id = ? AND EXISTS (
        SELECT 1
        FROM member m
        JOIN sites s ON s.organization_id = m.organizationId AND s.id = n.site_id
        LEFT JOIN business_locations bl ON bl.organization_id = m.organizationId AND bl.site_id = s.id AND bl.id = n.location_id
        JOIN teamMember tm
          ON tm.userId = m.userId
          AND (
            (n.location_id IS NULL AND tm.teamId = s.team_id)
            OR (n.location_id IS NOT NULL AND tm.teamId IN (s.team_id, bl.team_id))
          )
        WHERE m.id = ? AND m.organizationId = n.organization_id
      ))`)
      params.push(principal.organization.id, principal.organization.memberId)
    }
  }

  clauses.push(visibilityClauses.length > 0 ? `(${visibilityClauses.join(' OR ')})` : '0 = 1')

  return {
    whereSql: clauses.join(' AND '),
    whereParams: params,
  }
}

export async function getNotificationAccess(event: H3Event) {
  const context = await getDashboardContext(event, { requireSite: false, requireOrganization: false })
  const platformAdmin = await hasPlatformEventPermission(event, context.env, { platform: ['access'] })
  const filter = buildNotificationVisibilityFilter({
    userId: context.userId,
    platformAdmin,
    organization: context.organization,
  })

  return {
    ...context,
    ...filter,
  }
}
