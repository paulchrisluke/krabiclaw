import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { getDashboardHomeData } from '~/server/utils/dashboard-home'

export default defineEventHandler(async (event) => {
  const { db, organization, site } = await getDashboardContext(event, { requireSite: false })

  if (!site) {
    return jsonResponse({
      organization,
      site: null,
      locations: [],
      events: [],
      operations: { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 },
    })
  }

  const home = await getDashboardHomeData(db, organization.id, site.id, {
    memberId: organization.memberId,
    role: organization.role,
  })

  return jsonResponse({ organization, site, ...home })
})
import { defineEventHandler } from 'h3'
