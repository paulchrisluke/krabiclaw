import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { deleteProduct, requireSiteProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    // A product id in the path is not authorized by the site in the path.
    await requireSiteProduct(db, { organizationId: site.organization_id, siteId, productId })
    await deleteProduct(db, { organizationId: site.organization_id, productId })
    return jsonResponse({ success: true, product_id: productId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_delete_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to delete product' }, { status: 500 })
  }
})
