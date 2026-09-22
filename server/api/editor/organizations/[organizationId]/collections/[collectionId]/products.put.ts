import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listCollectionProducts, setCollectionProducts } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const collectionId = getRouterParam(event, 'collectionId')
  if (!siteId || !collectionId) return jsonResponse({ error: 'Site ID and collection ID are required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    const body = await readStrictBody<{ product_ids: unknown }>(event, { product_ids: 'unknown' })
    if (!Array.isArray(body.product_ids) || body.product_ids.some(id => typeof id !== 'string' || !id.trim())) {
      return jsonResponse({ error: 'product_ids must contain non-empty product IDs' }, { status: 400 })
    }
    // The complete intended membership and order. A partial list would leave
    // unnamed products at whatever position they happened to hold.
    await setCollectionProducts(db, {
      organizationId: site.organization_id, collectionId,
      productIds: body.product_ids.map(id => String(id).trim()), actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, products: await listCollectionProducts(db, { organizationId: site.organization_id, collectionId }) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('collection_products_failed', { siteId, collectionId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to set collection products' }, { status: 500 })
  }
})
