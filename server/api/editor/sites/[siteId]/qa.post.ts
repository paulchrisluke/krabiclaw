import { jsonResponse } from '~/server/utils/api-response'
import { createQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db, site } = await requireSiteAccess(event, siteId)
  const body = await readBody<{
    question?: string
    answer?: string | null
    question_author?: string | null
    is_owner_answer?: boolean
    sort_order?: number
    status?: 'published' | 'hidden'
  }>(event)
  const result = await createQa(db, {
    organizationId: site.organization_id,
    siteId,
    locationId: null,
  }, {
    question: body?.question ?? '',
    answer: body?.answer,
    question_author: body?.question_author,
    is_owner_answer: body?.is_owner_answer,
    sort_order: body?.sort_order,
    status: body?.status,
  })
  return jsonResponse(result.data, { status: result.status })
})
