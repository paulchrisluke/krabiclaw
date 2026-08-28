import type { ReorderProductsInput } from '~/server/types/products'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { reorderProducts } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readRequiredBody<ReorderProductsInput>(event)
    if (!Array.isArray(body.products)) return jsonResponse({ error: 'products must be an array' }, { status: 400 })
    await reorderProducts(db, site.organization_id, siteId, locationId, body.products, session.user.id)
    return jsonResponse({ success: true, products: body.products, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_reorder_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to reorder Products' }, { status: 500 })
  }
})
