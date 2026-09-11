import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { getProduct, setProductPublication } from '~/server/utils/product-management'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    const body = await readStrictBody<{ published: unknown }>(event, { published: 'unknown' })
    if (typeof body.published !== 'boolean') return jsonResponse({ error: 'published must be a boolean' }, { status: 400 })
    await setProductPublication(db, {
      organizationId: site.organization_id, productId, siteId, published: body.published, actor: { actorId: session.user.id },
    })
    return jsonResponse({ success: true, product: await getProduct(db, site.organization_id, productId) })
  } catch (error) {
    rethrowHttpError(error)
    console.error('product_publication_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to set product publication' }, { status: 500 })
  }
})
