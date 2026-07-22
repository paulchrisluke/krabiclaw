import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getOrganizationMembersData } from '~/server/utils/dashboard-members'

export default defineEventHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })
  const { members, invitations } = await getOrganizationMembersData(db, organization.id)
  return jsonResponse({ members, invitations })
})
