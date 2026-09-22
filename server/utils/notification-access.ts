import type { H3Event } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole, listAccessibleLocationIds, memberAccessPrincipal } from '~/server/utils/member-access'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { d1JsonStringSet } from '~/server/db/d1-limits'

export interface NotificationVisibilityPrincipal {
  userId: string
  platformAdmin: boolean
  organization: {
    id: string
    role: string
  } | null
  /**
   * The locations a location-scoped member can reach. `null` is an
   * organization-wide member, who reaches all of them.
   */
  locationIds?: string[] | null
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
    } else if (principal.locationIds?.length) {
      // A location-scoped member sees their locations' notifications, never the
      // organization-wide ones that carry no location.
      visibilityClauses.push(`(n.scope_kind = 'organization' AND n.organization_id = ? AND n.location_id IN (SELECT value FROM json_each(?)))`)
      params.push(principal.organization.id, d1JsonStringSet(principal.locationIds))
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
  const locationIds = context.organization && !isOrganizationWideRole(context.organization.role)
    ? await listAccessibleLocationIds(context.db, memberAccessPrincipal(context.organization, { env: context.env, event }))
    : null
  const filter = buildNotificationVisibilityFilter({
    userId: context.userId,
    platformAdmin,
    organization: context.organization,
    locationIds,
  })

  return {
    ...context,
    ...filter,
  }
}
