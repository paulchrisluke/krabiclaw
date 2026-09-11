import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { getProduct, setProductLocation } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !productId || !locationId) return jsonResponse({ error: 'Site, product and location IDs are required' }, { status: 400 })
  try {
    // Location access, not site access: a location editor may say whether this
    // branch offers the product without gaining rights over the product itself.
    const { db, session, site } = await requireLocationAccess(event, siteId, locationId)
    const body = await readStrictBody<{ active?: unknown; published?: unknown }>(event, { active: 'unknown', published: 'unknown' })
    for (const field of ['active', 'published'] as const) {
      if (body[field] !== undefined && typeof body[field] !== 'boolean') {
        return jsonResponse({ error: `${field} must be a boolean` }, { status: 400 })
      }
    }
    await setProductLocation(db, {
      organizationId: site.organization_id, productId, locationId,
      active: body.active as boolean | undefined, published: body.published as boolean | undefined,
      actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, product: await getProduct(db, site.organization_id, productId) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_location_failed', { siteId, productId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to set product location' }, { status: 500 })
  }
})
