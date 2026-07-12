import { jsonResponse } from '~/server/utils/api-response'
import { updateQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const qaId = getRouterParam(event, 'qaId')
  if (!siteId || !qaId) return jsonResponse({ error: 'Missing params' }, { status: 400 })
  const { db, site } = await requireSiteAccess(event, siteId)
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }
  try {
    return jsonResponse(await updateQa(db, {
      organizationId: site.organization_id,
      siteId,
      locationId: null,
      pagePath: typeof (body as ApiRecord).page_path === 'string' ? String((body as ApiRecord).page_path) : null,
    }, qaId, Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'page_path'))))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Q&A update failed'
    return jsonResponse({ error: message }, { status: message.includes('not found') ? 404 : 400 })
  }
})
