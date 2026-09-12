import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listSiteProducts } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID is required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    // Everything this site carries, published or withheld: the editor decides
    // visibility, so it must be able to see what is currently hidden.
    const products = await listSiteProducts(db, { organizationId: site.organization_id, siteId })
    return jsonResponse({ success: true, products, site_id: siteId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('products_list_failed', { siteId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list products' }, { status: 500 })
  }
})
