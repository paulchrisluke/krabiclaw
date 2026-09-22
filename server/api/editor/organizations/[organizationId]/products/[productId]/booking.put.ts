import { jsonResponse, readStrictBody, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { requireSiteProduct } from '~/server/utils/product-management'
import { executeBatch } from '~/server/db'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * Give a product the booking capability, or change its defaults.
 *
 * The existence of this row is what makes the product bookable. Removing it
 * is a separate, destructive operation, because it takes the sessions and
 * their bookings with it.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const { db, session, site } = await requireSiteAccess(event, siteId)
    // Authorizing the site does not authorize the product id in the path.
    await requireSiteProduct(db, { organizationId: site.organization_id, siteId, productId })
    const body = await readStrictBody<{ duration_minutes?: unknown; default_capacity?: unknown }>(event, { duration_minutes: 'unknown', default_capacity: 'unknown' })
    for (const field of ['duration_minutes', 'default_capacity'] as const) {
      const value = body[field]
      if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || (value as number) < 0)) {
        return jsonResponse({ error: `${field} must be a non-negative integer or null` }, { status: 400 })
      }
    }
    if (body.duration_minutes === 0) return jsonResponse({ error: 'duration_minutes must be positive' }, { status: 400 })
    const now = new Date().toISOString()
    await executeBatch(db, [{
      query: `INSERT INTO product_booking_configs (product_id, organization_id, duration_minutes, default_capacity, created_at, updated_at, created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (product_id) DO UPDATE SET duration_minutes = excluded.duration_minutes,
                default_capacity = excluded.default_capacity, updated_at = excluded.updated_at, updated_by = excluded.updated_by
                WHERE product_booking_configs.organization_id = excluded.organization_id`,
      params: [productId, site.organization_id, body.duration_minutes ?? null, body.default_capacity ?? null, now, now, session.user.id, session.user.id],
    }], { operation: 'Set product booking config' })
    return jsonResponse({ success: true, product_id: productId })
  } catch (error) {
    rethrowHttpError(error)
    console.error('booking_config_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to set booking configuration' }, { status: 500 })
  }
})
