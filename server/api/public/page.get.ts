import { HTTPError } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicPage } from '~/server/utils/public-page'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  if (!organizationId) throw new HTTPError({ statusCode: 400, statusMessage: 'organizationId required' })
  const query = getQuery(event)
  const payload = await loadPublicPage(
    event, organizationId, Object.fromEntries(Object.entries(query).map(([key, value]) => [
      key, typeof value === 'string' ? value : undefined, ])), )
  return jsonResponse(finalizeRequestMetrics(event, 'public-page', payload))
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
