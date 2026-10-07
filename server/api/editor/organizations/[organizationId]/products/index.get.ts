import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { hydrateProductMedia, listOrganizationProducts } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })
  try {
    const { db, organization } = await requireOrganizationAccess(event, organizationId)
    // Everything this site carries, published or withheld: the editor decides
    // visibility, so it must be able to see what is currently hidden.
    // The same photographs the location list attaches, so a row looks the same in every scope.
    const products = await hydrateProductMedia(db, organization.id, await listOrganizationProducts(db, { organizationId: organization.id }))
    return jsonResponse({ success: true, products, organization_id: organizationId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('products_list_failed', { organizationId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list products' }, { status: 500 })
  }
})
