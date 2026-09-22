import { HTTPError } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicShell } from '~/server/utils/public-shell'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  if (!organizationId) throw new HTTPError({ statusCode: 400, statusMessage: 'organizationId required' })
  const query = getQuery(event)
  const payload = await loadPublicShell(event, organizationId, {
    locale: typeof query.locale === 'string' ? query.locale : undefined, })
  return jsonResponse(finalizeRequestMetrics(event, 'public-shell', payload))
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
