import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listCollections, reorderCollections } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    const body = await readStrictBody<{ collection_ids: unknown; location_id?: unknown }>(event, { collection_ids: 'unknown', location_id: 'unknown' })
    if (!Array.isArray(body.collection_ids) || body.collection_ids.some(id => typeof id !== 'string' || !id.trim())) {
      return jsonResponse({ error: 'collection_ids must contain non-empty collection IDs' }, { status: 400 })
    }
    const locationId = body.location_id === undefined ? null : (body.location_id === null ? null : String(body.location_id))
    await reorderCollections(db, {
      organizationId: site.organization_id, siteId, locationId,
      collectionIds: body.collection_ids.map(id => String(id).trim()), actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, collections: await listCollections(db, { organizationId: site.organization_id, siteId, locationId }) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('collections_reorder_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to reorder collections' }, { status: 500 })
  }
})
