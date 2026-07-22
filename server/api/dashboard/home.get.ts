import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getDashboardHomeData } from '~/server/utils/dashboard-home'

export default defineEventHandler(async (event) => {
  const { db, organization, site } = await getDashboardContext(event, { requireSite: false })

  if (!site) {
    return jsonResponse({ organization, site: null, locations: [], credits: null, events: [] })
  }

  const home = await getDashboardHomeData(db, organization.id, site.id, {
    memberId: organization.memberId,
    role: organization.role,
  })

  return jsonResponse({ organization, site, ...home })
})
