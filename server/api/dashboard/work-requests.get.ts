// GET /api/dashboard/work-requests — Growth client views their own priority-support requests
import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { listWorkRequests } from '~/server/utils/work-requests-dashboard'

export default defineHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })

  const requests = await listWorkRequests(db, organization.id)

  return jsonResponse({ requests })
})
import { defineHandler } from 'nitro';
