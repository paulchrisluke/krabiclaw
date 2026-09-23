import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { deleteProduct, requireSiteProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const productId = getRouterParam(event, 'productId')
  if (!organizationId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const { db, organization } = await requireOrganizationAccess(event, organizationId)
    // A product id in the path is not authorized by the site in the path.
    await requireSiteProduct(db, { organizationId: organization.id, productId })
    await deleteProduct(db, { organizationId: organization.id, productId })
    return jsonResponse({ success: true, product_id: productId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_delete_failed', { organizationId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to delete product' }, { status: 500 })
  }
})
