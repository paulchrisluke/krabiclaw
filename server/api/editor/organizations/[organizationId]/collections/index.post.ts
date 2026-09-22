import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { createCollection } from '~/server/utils/product-management'
import type { CreateCollectionInput } from '~/server/types/products'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    const body = await readRequiredBody<Omit<CreateCollectionInput, 'site_id'>>(event)
    const collection = await createCollection(db, {
      organizationId: site.organization_id,
      collection: { ...body, site_id: siteId },
      actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, collection }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('collection_create_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to create collection' }, { status: 500 })
  }
})
