import type { CreateProductInput } from '~/server/types/products'
import { jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { createProduct } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })

  try {
    const { env, db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readRequiredBody<CreateProductInput>(event)
    const product = await createProduct(db, site.organization_id, siteId, locationId, body, { actorId: session.user.id }, env)
    return jsonResponse({ success: true, product, site_id: siteId, location_id: locationId }, { status: 201 })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_create_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to create Product' }, { status: 500 })
  }
})
