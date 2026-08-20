import { jsonResponse } from '~/server/utils/api-response'
import { loadPublicDraftShell } from '~/server/utils/public-draft-bootstrap'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

export default defineHandler(async (event) => {
  const draftId = String(getRouterParam(event, 'draftId') || '').trim()
  const rawQuery = getQuery(event)
  const query = Object.fromEntries(
    Object.entries(rawQuery).filter((entry): entry is [string, string] => typeof entry[1] === 'string'), )
  const payload = await loadPublicDraftShell(event, draftId, query)
  return jsonResponse(finalizeRequestMetrics(event, 'public-draft-shell', payload))
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
