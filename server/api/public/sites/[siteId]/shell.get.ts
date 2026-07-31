import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicShell } from '~/server/utils/public-bootstrap'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'siteId required' })
  const query = getQuery(event)
  const payload = await loadPublicShell(event, siteId, {
    locale: typeof query.locale === 'string' ? query.locale : undefined,
    token: typeof query.token === 'string' ? query.token : undefined,
  })
  return jsonResponse(finalizeRequestMetrics(event, 'public-shell', payload))
})
