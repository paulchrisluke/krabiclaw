import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { listDashboardEvents } from '~/server/utils/dashboard-events'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })
  const query = getQuery(event)
  const payload = await listDashboardEvents(db, organization.id, {
    limit: Number(query.limit) || 20, siteId: typeof query.siteId === 'string' ? query.siteId : undefined, locationId: typeof query.locationId === 'string' ? query.locationId : undefined, eventType: typeof query.eventType === 'string' ? query.eventType : undefined, actorId: typeof query.actorId === 'string' ? query.actorId : undefined, before: typeof query.before === 'string' ? query.before : undefined, })
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-events', payload))
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
