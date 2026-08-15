import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicPage } from '~/server/utils/public-page'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'siteId required' })
  const query = getQuery(event)
  const payload = await loadPublicPage(
    event,
    siteId,
    Object.fromEntries(Object.entries(query).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : undefined,
    ])),
  )
  return jsonResponse(finalizeRequestMetrics(event, 'public-page', payload))
})
import { defineEventHandler } from 'h3'
import { getQuery } from 'h3'
import { getRouterParam } from 'h3'
