import type { H3Event } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole, listAccessibleLocationIds } from '~/server/utils/member-access'
import { hasPlatformEventPermission } from '~/server/utils/platform-admin-users'
import { queryAll } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'

export interface NotificationVisibilityPrincipal {
  userId: string
  platformAdmin: boolean
  organization: {
    id: string
    role: string
    memberId: string
  } | null
  siteWideSiteIds?: string[]
  locationIds?: string[]
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
      const accessClauses: string[] = []
      if (principal.siteWideSiteIds?.length) {
        accessClauses.push(`n.site_id IN (SELECT value FROM json_each(?))`)
      }
      if (principal.locationIds?.length) {
        accessClauses.push(`n.location_id IN (SELECT value FROM json_each(?))`)
      }
      if (accessClauses.length) {
        visibilityClauses.push(`(n.scope = 'site' AND n.organization_id = ? AND (${accessClauses.join(' OR ')}))`)
        params.push(
          principal.organization.id,
          ...(principal.siteWideSiteIds?.length ? [d1JsonStringSet(principal.siteWideSiteIds)] : []),
          ...(principal.locationIds?.length ? [d1JsonStringSet(principal.locationIds)] : []),
        )
      }
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
  const siteWideSiteIds: string[] = []
  const locationIds: string[] = []
  if (context.organization && !isOrganizationWideRole(context.organization.role)) {
    const sites = await queryAll<{ id: string }>(context.db, `
      SELECT id FROM sites WHERE organization_id = ?
    `, [context.organization.id])
    await Promise.all(sites.map(async (site) => {
      const accessibleLocationIds = await listAccessibleLocationIds(context.db, {
        env: context.env,
        memberId: context.organization!.memberId,
        role: context.organization!.role,
        organizationId: context.organization!.id,
        siteId: site.id,
      })
      if (accessibleLocationIds === null) siteWideSiteIds.push(site.id)
      else locationIds.push(...accessibleLocationIds)
    }))
  }
  const filter = buildNotificationVisibilityFilter({
    userId: context.userId,
    platformAdmin,
    organization: context.organization,
    siteWideSiteIds,
    locationIds,
  })

  return {
    ...context,
    ...filter,
  }
}
