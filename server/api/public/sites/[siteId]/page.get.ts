import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicPage } from '~/server/utils/public-bootstrap'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'siteId required' })
  const query = getQuery(event)
  return jsonResponse(await loadPublicPage(
    event,
    siteId,
    Object.fromEntries(Object.entries(query).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : undefined,
    ])),
  ))
})
