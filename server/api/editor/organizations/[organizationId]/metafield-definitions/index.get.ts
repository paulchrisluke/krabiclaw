import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listMetafieldDefinitions } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    // The tenant's whole product attribute vocabulary. Adding to it is how a
    // new descriptive attribute comes into existence.
    return jsonResponse({ success: true, definitions: await listMetafieldDefinitions(db, site.organization_id) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('metafield_definitions_list_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list metafield definitions' }, { status: 500 })
  }
})
