import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { loadDashboardProduct } from '~/server/utils/dashboard-editor-resources'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

// One product, for the editor that is opening it. The editor used to read the
// whole location catalogue and find one row in it: on the largest site here
// that is 365 products with every variant and price, 888 KB, to render one.
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  const locationId = getRouterParam(event, 'locationId')
  const productId = getRouterParam(event, 'productId')
  if (!organizationId || !locationId || !productId) {
    return jsonResponse({ error: 'Site ID, location ID and product ID are required' }, { status: 400 })
  }
  try {
    return jsonResponse(await loadDashboardProduct(event, organizationId, locationId, productId))
  } catch (error) {
    rethrowHttpError(error)
    console.error('location_product_read_failed', { organizationId, locationId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load this product' }, { status: 500 })
  }
})
