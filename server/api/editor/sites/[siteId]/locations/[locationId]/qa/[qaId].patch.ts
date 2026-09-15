// PATCH /api/editor/sites/[siteId]/locations/[locationId]/qa/[qaId]
import { cleanString, jsonResponse } from '~/server/utils/api-response'
import { updateLocationQa } from '~/server/utils/mcp-workflows'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const qaId = getRouterParam(event, 'qaId')
  if (!siteId || !locationId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const { db, site } = await requireLocationAccess(event, siteId, locationId)

  const rawBody = await readBody(event)
  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  const body = rawBody as {
    question?: unknown
    answer?: unknown
    question_author?: unknown
    is_owner_answer?: unknown
    status?: unknown
    sort_order?: unknown
  }

  try {
    const result = await updateLocationQa(db, site.organization_id, siteId, locationId, qaId, {
      question: body.question !== undefined ? cleanString(body.question, 500) : undefined, answer: body.answer !== undefined ? cleanString(body.answer, 2000) : undefined, question_author: body.question_author !== undefined ? cleanString(body.question_author, 120) : undefined, is_owner_answer: body.is_owner_answer, status: body.status !== undefined ? cleanString(body.status, 20) : undefined, sort_order: body.sort_order, })
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Q&A update failed'
    return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
