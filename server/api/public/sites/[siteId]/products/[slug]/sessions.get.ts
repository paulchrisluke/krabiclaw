import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll, queryFirst } from '~/server/db'
import { bookingWindow, listSessions } from '~/server/utils/availability'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

/**
 * The sessions a guest can book.
 *
 * Only sessions that exist: there is no computed schedule to fall back on, so
 * a product whose sessions have not been generated returns an empty list and
 * the page says there is nothing to book. It does not invent slots from a
 * recurrence rule the merchant has not materialized.
 */
export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const slug = getRouterParam(event, 'slug')
  if (!siteId || !slug) return jsonResponse({ error: 'siteId and slug required' }, { status: 400 })
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const product = await queryFirst<{ id: string; organization_id: string; name: string; timezone: string | null }>(db, `
    SELECT p.id, p.organization_id, p.name,
           (SELECT l.timezone FROM business_locations l
              JOIN product_locations pl ON pl.location_id = l.id AND pl.product_id = p.id
             WHERE pl.published = 1 AND pl.active = 1 AND l.status = 'active' LIMIT 1) AS timezone
      FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      JOIN product_booking_configs cfg ON cfg.product_id = p.id
     WHERE pub.site_id = ? AND pub.published = 1 AND p.slug = ? AND p.active = 1
     LIMIT 1
  `, [siteId, slug])
  if (!product) return jsonResponse({ error: 'Product not found' }, { status: 404 })
  if (!product.timezone) return jsonResponse({ error: 'This product is not on sale at any location' }, { status: 409 })

  // A session belongs to a location, and a branch that has stopped selling
  // this product does not offer its occurrences either.
  const sellingLocations = new Set((await queryAll<{ location_id: string }>(db, `
    SELECT pl.location_id FROM product_locations pl
      JOIN business_locations l ON l.id = pl.location_id AND l.site_id = ? AND l.status = 'active'
     WHERE pl.product_id = ? AND pl.active = 1 AND pl.published = 1
  `, [siteId, product.id])).map(row => row.location_id))

  const window = bookingWindow(product.timezone)
  const sessions = await listSessions(db, {
    organizationId: product.organization_id, productId: product.id,
    fromInstant: window.fromInstant, toInstant: window.toInstant, statuses: ['scheduled'],
  })
  return jsonResponse({
    success: true,
    product: { id: product.id, name: product.name, slug },
    sessions: sessions.filter(session => session.location_id === null || sellingLocations.has(session.location_id)).map(session => ({
      id: session.id, starts_at: session.starts_at, ends_at: session.ends_at,
      timezone: session.timezone, remaining: session.remaining, is_full: session.is_full,
    })),
  })
})
