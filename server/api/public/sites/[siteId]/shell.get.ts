import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicShell } from '~/server/utils/public-bootstrap'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'siteId required' })
  const query = getQuery(event)
  return jsonResponse(await loadPublicShell(event, siteId, {
    locale: typeof query.locale === 'string' ? query.locale : undefined,
    token: typeof query.token === 'string' ? query.token : undefined,
  }))
})
