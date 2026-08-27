import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getOrganizationMembersData } from '~/server/utils/dashboard-members'

export default defineHandler(async (event) => {
  const { env, organization } = await getDashboardContext(event, { requireSite: false })
  const { members, invitations } = await getOrganizationMembersData(env, organization.id)
  return jsonResponse({ members, invitations })
})
import { defineHandler } from 'nitro';
