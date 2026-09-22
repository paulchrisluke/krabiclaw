import type { CreateProductInput } from '~/server/types/products'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { createProduct, setProductPublication } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, organizationId)
    const body = await readRequiredBody<CreateProductInput>(event)
    const product = await createProduct(db, { organizationId: site.organization_id, product: body, actor: { actorId: session.user.id } })
    // Creating from a site's editor means that site carries the product. It
    // is NOT published by that act: publication is a separate, explicit state.
    await setProductPublication(db, {
      organizationId, productId: product.id, published: false, actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, product, organization_id: organizationId }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_create_failed', { organizationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to create product' }, { status: 500 })
  }
})
