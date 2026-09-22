import { defineHandler } from 'nitro'
import { getQuery } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardOrganizationAnalytics } from '~/server/utils/dashboard-org-analytics'

export default defineHandler(async (event) => {
  const query = getQuery(event)
  return jsonResponse(await loadDashboardOrganizationAnalytics(event, {
    startDate: typeof query.startDate === 'string' ? query.startDate : undefined,
    endDate: typeof query.endDate === 'string' ? query.endDate : undefined,
  }))
})
