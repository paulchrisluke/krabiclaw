import { defineHandler, getQuery, HTTPError } from 'nitro'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext, listDashboardLocations } from '~/server/utils/dashboard-context'
import { listDashboardLocationsResource } from '~/server/utils/dashboard-locations-resource'
import { isOrganizationWideRole, listUserOrganizationTeamIds } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const query = getQuery(event)
  const organizationScoped = query.organization === 'true'

  if (organizationScoped) {
    const { env, db, organization, userId } = await getDashboardContext(event, {
      requireSite: false,
      requireOrganization: true,
    })
    if (!organization) {
      throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
    }

    const teamIds = isOrganizationWideRole(organization.role)
      ? null
      : await listUserOrganizationTeamIds({ env: cloudflareEnv(event), organizationId: organization.id, userId })
    const principal = { env, memberId: organization.memberId, role: organization.role, teamIds }

    const locations = await listDashboardLocations(db, organization.id, null, principal, true)
    return jsonResponse({ success: true as const, locations })
  }

  return jsonResponse(await listDashboardLocationsResource(event))
})

