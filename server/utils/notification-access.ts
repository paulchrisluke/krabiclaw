import type { H3Event } from 'nitro'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'

export interface NotificationVisibilityPrincipal {
  userId: string
  platformAdmin: boolean
  organization: {
    id: string
    role: string
  } | null
}

export function buildNotificationVisibilityFilter(principal: NotificationVisibilityPrincipal) {
  const clauses = [
    "n.kind = 'notification'",
    `(n.target_user_id IS NULL OR n.target_user_id = ?)`,
  ]
  const params: unknown[] = [principal.userId]
  const visibilityClauses: string[] = []

  // scope_kind is the column the CHECK constrains, so it is the only place a
  // notification's scope is read from.
  if (principal.platformAdmin) visibilityClauses.push(`n.scope_kind = 'global'`)

  if (principal.organization) {
    if (isOrganizationWideRole(principal.organization.role)) {
      visibilityClauses.push(`(n.scope_kind = 'organization' AND n.organization_id = ?)`)
      params.push(principal.organization.id)
    }
  }

  clauses.push(visibilityClauses.length > 0 ? `(${visibilityClauses.join(' OR ')})` : '0 = 1')

  return {
    whereSql: clauses.join(' AND '),
    whereParams: params,
  }
}

export async function getNotificationAccess(event: H3Event) {
  const context = await getDashboardContext(event, { requireOrganization: false })
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
