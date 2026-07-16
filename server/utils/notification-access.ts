import type { H3Event } from 'h3'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

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
      // A location-scoped member may only see site notifications covered by an
      // explicit access scope. A null notification location is site-wide and
      // therefore requires a null (whole-site) member scope.
      visibilityClauses.push(`(n.scope = 'site' AND n.organization_id = ? AND EXISTS (
        SELECT 1 FROM member_access_scope mas
        WHERE mas.member_id = ?
          AND mas.organization_id = n.organization_id
          AND mas.site_id = n.site_id
          AND (
            (n.location_id IS NULL AND mas.location_id IS NULL)
            OR (n.location_id IS NOT NULL AND (mas.location_id IS NULL OR mas.location_id = n.location_id))
          )
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
  const platformAdmin = isPlatformAdmin(context.session.user as { role?: string | null; email?: string | null }, context.env)
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
