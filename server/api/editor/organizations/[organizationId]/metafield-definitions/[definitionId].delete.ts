import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { deleteMetafieldDefinition } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const definitionId = getRouterParam(event, 'definitionId')
  if (!siteId || !definitionId) return jsonResponse({ error: 'Site ID and definition ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    // Values cascade: removing an attribute from the vocabulary removes it
    // from every product that carried it, which is the point of doing it.
    await deleteMetafieldDefinition(db, { organizationId: site.organization_id, definitionId })
    return jsonResponse({ success: true, definition_id: definitionId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('metafield_definition_delete_failed', { siteId, definitionId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to delete metafield definition' }, { status: 500 })
  }
})
