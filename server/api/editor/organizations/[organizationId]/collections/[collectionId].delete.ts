import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { deleteCollection } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const collectionId = getRouterParam(event, 'collectionId')
  if (!siteId || !collectionId) return jsonResponse({ error: 'Site ID and collection ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    // Deleting a grouping never deletes what was grouped.
    await deleteCollection(db, { organizationId: site.organization_id, collectionId })
    return jsonResponse({ success: true, collection_id: collectionId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('collection_delete_failed', { siteId, collectionId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to delete collection' }, { status: 500 })
  }
})
