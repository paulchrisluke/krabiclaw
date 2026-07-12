import { jsonResponse } from '~/server/utils/api-response'
import { reorderQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  const { db, site } = await requireSiteAccess(event, siteId)
  const body = await readBody<{ page_path?: string | null; updates?: Array<{ id?: unknown; sort_order?: unknown }> }>(event)
  const updates = Array.isArray(body?.updates)
    ? body.updates.map(item => ({ id: String(item.id ?? ''), sort_order: Number(item.sort_order) }))
    : []
  try {
    return jsonResponse(await reorderQa(db, {
      organizationId: site.organization_id,
      siteId,
      locationId: null,
      pagePath: body?.page_path,
    }, updates))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Q&A reorder failed'
    return jsonResponse({ error: message }, { status: message.includes('scope') ? 404 : 400 })
  }
})
