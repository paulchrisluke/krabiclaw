import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireLocationAccess } from '~/server/utils/location-access'
import { hydrateProductMedia, listLocationProducts } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')
  if (!siteId || !locationId) return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireLocationAccess(event, siteId, locationId)
    // The editor shows the photograph the public page shows. Placements are
    // site-scoped, so they are attached here, for this site, the same way the
    // public reader attaches them — a list that said "no photo" for a product
    // with a live cover was the editor lying about the customer's page.
    const products = await hydrateProductMedia(db, siteId, await listLocationProducts(db, { organizationId: site.organization_id, locationId }))
    return jsonResponse({ success: true, products, site_id: siteId, location_id: locationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('location_products_list_failed', { siteId, locationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list products for this location' }, { status: 500 })
  }
})
