import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicShell } from '~/server/utils/public-shell'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locale = getRouterParam(event, 'locale')
  if (!siteId || !locale) throw createError({ statusCode: 400, statusMessage: 'Site ID and locale are required' })
  const query = getQuery(event)
  const payload = await loadPublicShell(event, siteId, {
    locale,
    token: typeof query.token === 'string' ? query.token : undefined,
  })
  return jsonResponse(finalizeRequestMetrics(event, 'public-localized-shell', payload))
})
