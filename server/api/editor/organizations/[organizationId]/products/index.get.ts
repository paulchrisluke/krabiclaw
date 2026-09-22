import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listSiteProducts } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, organizationId)
    // Everything this site carries, published or withheld: the editor decides
    // visibility, so it must be able to see what is currently hidden.
    const products = await listSiteProducts(db, { organizationId: site.organization_id })
    return jsonResponse({ success: true, products, site_id: organizationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('products_list_failed', { organizationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list products' }, { status: 500 })
  }
})
