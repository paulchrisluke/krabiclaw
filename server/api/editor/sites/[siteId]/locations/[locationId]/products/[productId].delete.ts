import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { deleteProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !locationId || !productId) return jsonResponse({ error: 'Site ID, location ID, and Product ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const deleted = await deleteProduct(db, site.organization_id, siteId, locationId, productId, session.user.id)
    if (!deleted) return jsonResponse({ error: 'Product not found' }, { status: 404 })
    return jsonResponse({ success: true, product_id: productId, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_delete_failed', { siteId, locationId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to delete Product' }, { status: 500 })
  }
})
