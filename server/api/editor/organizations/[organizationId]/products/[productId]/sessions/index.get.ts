import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { requireSiteProduct } from '~/server/utils/product-management'
import { listSessions } from '~/server/utils/availability'
import { PRODUCT_SESSION_STATUSES, type ProductSessionStatus } from '~/shared/bookings'
import { defineHandler } from 'nitro'
import { getQuery, getRouterParam } from 'nitro/h3'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const productId = getRouterParam(event, 'productId')
  if (!siteId || !productId) return jsonResponse({ error: 'Site ID and product ID are required' }, { status: 400 })
  try {
    const { db, site } = await requireSiteAccess(event, siteId)
    // A product id in the path is not authorized by the site in the path.
    await requireSiteProduct(db, { organizationId: site.organization_id, siteId, productId })
    const query = getQuery(event)
    const from = typeof query.from === 'string' ? query.from : new Date().toISOString()
    const to = typeof query.to === 'string' ? query.to : new Date(Date.now() + 90 * 86_400_000).toISOString()
    // The editor sees cancelled and completed sessions too: hiding them would
    // make a cancelled class look like one that was never scheduled.
    const statuses = typeof query.status === 'string'
      ? String(query.status).split(',').filter((value): value is ProductSessionStatus => (PRODUCT_SESSION_STATUSES as readonly string[]).includes(value))
      : [...PRODUCT_SESSION_STATUSES]
    const sessions = await listSessions(db, { organizationId: site.organization_id, productId, fromInstant: from, toInstant: to, statuses })
    return jsonResponse({ success: true, sessions })
  } catch (error) {
    rethrowHttpError(error)
    console.error('sessions_list_failed', { siteId, productId, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to list sessions' }, { status: 500 })
  }
})
