import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { getProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const productId = getRouterParam(event, 'productId')
  if (!organizationId || !productId) return jsonResponse({ error: 'Organization and Product IDs are required' }, { status: 400 })
  try {
    const { db, organization } = await requireOrganizationAccess(event, organizationId)
    return jsonResponse({ success: true, product: await getProduct(db, organization.id, productId) })
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: 'Failed to load Product' }, { status: 500 })
  }
})
