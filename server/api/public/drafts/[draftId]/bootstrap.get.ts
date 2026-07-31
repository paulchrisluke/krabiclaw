import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicDraftBootstrap } from '~/server/utils/public-draft-bootstrap'

export default defineEventHandler(async (event) => {
  const draftId = String(getRouterParam(event, 'draftId') || '').trim()
  const rawQuery = getQuery(event)
  const query = Object.fromEntries(
    Object.entries(rawQuery).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  return jsonResponse(await loadPublicDraftBootstrap(event, draftId, query))
})
