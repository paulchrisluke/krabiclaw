import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { updateCollection } from '~/server/utils/product-management'
import type { UpdateCollectionInput } from '~/server/types/products'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const collectionId = getRouterParam(event, 'collectionId')
  if (!siteId || !collectionId) return jsonResponse({ error: 'Site ID and collection ID are required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    const body = await readRequiredBody<UpdateCollectionInput>(event)
    const collection = await updateCollection(db, {
      organizationId: site.organization_id, collectionId, patch: body, actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, collection })
  } catch (error) {
    rethrowHttpError(error)
    console.error('collection_update_failed', { siteId, collectionId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to update collection' }, { status: 500 })
  }
})
