import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  dashboardOrgQueryParam,
  getDashboardContext,
  listDashboardLocations,
  loadDashboardOrganizationCard,
} from '~/server/utils/dashboard-context'
import { isOrganizationWideRole, listUserOrganizationTeamIds, resolveDashboardAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { recordRequestPhase } from '~/server/utils/request-metrics'

// The scope is the route's `org` query param. No organization is a 400 and one
// this session cannot see is a 404 (getDashboardContext). Neither is a payload
// with nulls in it: the dashboard rendered that payload as "not found" on the
// client while the server had logged a 200.
//
// There is no second `site` scope beside the organization any more, so there is
// no switcher to draw and no list to load: the organization is the tenant.
export async function loadDashboardContext(
  event: H3Event,
  scope: { orgSlug: string | null } = { orgSlug: dashboardOrgQueryParam(event) },
) {
  const contextStartedAt = performance.now()
  const env = cloudflareEnv(event)
  const { db, organization, userId } = await getDashboardContext(event, {
    organizationSlug: scope.orgSlug,
  })
  recordRequestPhase(event, 'context', contextStartedAt)

  const teamIds = isOrganizationWideRole(organization.role)
    ? null
    : await listUserOrganizationTeamIds({ env, organizationId: organization.id, userId, event })
  const principal = { env, userId, role: organization.role, teamIds }

  const resourcesStartedAt = performance.now()
  const [card, locations, access] = await Promise.all([
    loadDashboardOrganizationCard(env, db, organization.id),
    listDashboardLocations(db, organization.id, principal),
    resolveDashboardAccess(db, memberAccessPrincipal(organization, { env, event })),
  ])
  recordRequestPhase(event, 'resources', resourcesStartedAt)

  return {
    success: true as const,
    organization: { ...organization, ...card },
    locations,
    access,
  }
}
