import type { UpdateProductInput } from '~/server/types/products'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { updateProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !locationId || !productId) return jsonResponse({ error: 'Site ID, location ID, and Product ID are required' }, { status: 400 })

  try {
    const { env, db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readRequiredBody<UpdateProductInput>(event)
    if (!Object.keys(body).length) return jsonResponse({ error: 'No update fields provided' }, { status: 400 })
    const product = await updateProduct(db, site.organization_id, siteId, locationId, productId, body, { actorId: session.user.id }, env)
    return jsonResponse({ success: true, product, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_update_failed', { siteId, locationId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to update Product' }, { status: 500 })
  }
})
