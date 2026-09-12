import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { getProduct, removeProductLocation, requireSiteProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !productId || !locationId) return jsonResponse({ error: 'Site, product and location IDs are required' }, { status: 400 })
  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)
    // A product id in the path is not authorized by the site in the path.
    await requireSiteProduct(db, { organizationId: site.organization_id, siteId, productId })
    await removeProductLocation(db, { organizationId: site.organization_id, productId, locationId })
    return jsonResponse({ success: true, product: await getProduct(db, site.organization_id, productId) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_location_remove_failed', { siteId, productId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to remove product from location' }, { status: 500 })
  }
})
