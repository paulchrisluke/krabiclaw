import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { requireSiteProduct } from '~/server/utils/product-management'
import { executeBatch, queryFirst } from '~/server/db'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Take the booking capability away.
 *
 * The configuration row IS the capability, and its foreign keys carry the
 * schedule: removing it deletes this product's sessions. A session anything
 * has been booked on is not something an editor may delete by unticking a box,
 * so this refuses while any booking exists — cancelled ones included, because
 * they are the record that it happened.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    await requireSiteProduct(db, { organizationId: site.organization_id, siteId, productId })
    const booked = await queryFirst<{ n: number }>(db, `
      SELECT count(*) AS n FROM bookings WHERE organization_id = ? AND product_id = ?
    `, [site.organization_id, productId])
    if ((booked?.n ?? 0) > 0) {
      return jsonResponse({ error: 'This product has bookings. Cancel them, or leave bookings on and turn the product off instead.' }, { status: 409 })
    }
    await executeBatch(db, [
      { query: 'DELETE FROM product_booking_configs WHERE organization_id = ? AND product_id = ?', params: [site.organization_id, productId] },
    ], { operation: 'Remove product booking config' })
    return jsonResponse({ success: true, product_id: productId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('booking_config_delete_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to remove booking configuration' }, { status: 500 })
  }
})
