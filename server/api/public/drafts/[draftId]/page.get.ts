import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicDraftPage } from '~/server/utils/public-draft-bootstrap'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineEventHandler(async (event) => {
  const draftId = String(getRouterParam(event, 'draftId') || '').trim()
  const rawQuery = getQuery(event)
  const query = Object.fromEntries(
    Object.entries(rawQuery).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  const payload = await loadPublicDraftPage(event, draftId, query)
  return jsonResponse(finalizeRequestMetrics(event, 'public-draft-page', payload))
})
