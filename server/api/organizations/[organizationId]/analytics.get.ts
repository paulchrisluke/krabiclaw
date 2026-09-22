import { HTTPError, defineHandler  } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardSiteAnalytics } from '~/server/utils/dashboard-site-analytics'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) throw new HTTPError({ statusCode: 400, statusMessage: 'Organization ID is required' })
  const query = getQuery(event)
  return jsonResponse(await loadDashboardSiteAnalytics(event, organizationId, {
    startDate: typeof query.startDate === 'string' ? query.startDate : undefined, endDate: typeof query.endDate === 'string' ? query.endDate : undefined, }))
})
import { getQuery, getRouterParam  } from 'nitro/h3';
