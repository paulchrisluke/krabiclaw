import { jsonResponse } from '~/server/utils/api-response'
import { reorderQa } from '~/server/utils/location-qa'
import { requireSiteAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })
  const { db, site } = await requireSiteAccess(event, organizationId)
  const body = await readBody<{ page_path?: string | null; updates?: Array<{ id?: unknown; sort_order?: unknown }> }>(event)
  const pagePath = typeof body?.page_path === 'string' ? String(body.page_path) : null
  const updates = Array.isArray(body?.updates)
    ? body.updates.map(item => ({ id: String(item.id ?? ''), sort_order: Number(item.sort_order) }))
    : []
  try {
    return jsonResponse(await reorderQa(db, {
      organizationId: site.organization_id, locationId: null, pagePath, }, updates))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Q&A reorder failed'
    return jsonResponse({ error: message }, { status: message.includes('scope') ? 404 : 400 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam, readBody  } from 'nitro/h3';
