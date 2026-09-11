import type { UpdateProductInput } from '~/server/types/products'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { updateProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    const body = await readRequiredBody<UpdateProductInput>(event)
    const product = await updateProduct(db, {
      organizationId: site.organization_id, siteId, productId, patch: body, actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, product })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_update_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to update product' }, { status: 500 })
  }
})
