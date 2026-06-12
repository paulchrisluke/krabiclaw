import { jsonResponse } from '~/server/utils/api-response'
import { createLocationQa } from '~/server/utils/location-qa'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Missing params' }, { status: 400 })

  const body = await readBody<{
    question?: string
    answer?: string | null
    question_author?: string | null
    is_owner_answer?: boolean
    sort_order?: number
  }>(event)

  const { db, site } = await requireLocationAccess(event, siteId, locationId)
  const result = await createLocationQa(db, site.organization_id, siteId, locationId, {
    question: body?.question ?? '',
    answer: body?.answer ?? null,
    question_author: body?.question_author ?? null,
    is_owner_answer: body?.is_owner_answer !== false,
    sort_order: body?.sort_order ?? 0,
  })

  return jsonResponse(result.data, { status: result.status })
})
