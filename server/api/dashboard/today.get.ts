import { defineHandler } from 'nitro'
import { jsonResponse } from '~/server/utils/api-response'
import { listTodayAgenda } from '~/server/utils/dashboard-agenda'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const { env, db, organization, userId } = await getDashboardContext(event, { requireSite: false })
  const today = await listTodayAgenda(db, organization.id, {
    organizationSlug: organization.slug,
    principal: { env, userId, role: organization.role },
  })
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-today', today))
})
