import { HTTPError } from 'nitro'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { bookingWindow, listSessions } from '~/server/utils/availability'
import { listOrganizationProducts } from '~/server/utils/product-management'
import { isCurrencyCode } from '~/shared/currencies'
import { publicTenantVisibilitySql } from '~/server/utils/public-base'

export async function listPublicBookingSessions(db: DbClient, organizationId: string, slug: string, requestedScope?: unknown) {
  const product = await queryFirst<{ id: string; organization_id: string; name: string; timezone: string | null }>(db, `
    SELECT p.id, p.organization_id, p.name,
           COALESCE(cfg.online_timezone,
           (SELECT l.timezone FROM business_locations l
              JOIN product_locations pl ON pl.location_id = l.id AND pl.product_id = p.id
             WHERE l.organization_id = p.organization_id AND pl.published = 1 AND pl.active = 1 AND l.status = 'active' ORDER BY l.id LIMIT 1)) AS timezone
      FROM products p
      JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      JOIN product_booking_configs cfg ON cfg.product_id = p.id AND cfg.organization_id = p.organization_id
     WHERE pub.organization_id = ? AND pub.published = 1 AND p.slug = ? AND p.active = 1
     LIMIT 1
  `, [organizationId, slug])
  if (!product) throw new HTTPError({ statusCode: 404, statusMessage: 'Product not found' })
  if (!product.timezone) throw new HTTPError({ statusCode: 409, statusMessage: 'Set the configured online or location timezone before offering sessions' })

  // A session belongs to a location, and a branch that has stopped selling
  // this product does not offer its occurrences either.
  const sellingLocations = new Set((await queryAll<{ location_id: string }>(db, `
    SELECT pl.location_id FROM product_locations pl
      JOIN business_locations l ON l.id = pl.location_id AND l.organization_id = ? AND l.status = 'active'
     WHERE pl.product_id = ? AND pl.active = 1 AND pl.published = 1
  `, [organizationId, product.id])).map(row => row.location_id))

  const onlineOnly = requestedScope === 'online'
  const requestedLocation = typeof requestedScope === 'string' && !onlineOnly ? requestedScope : null
  if (requestedLocation && !sellingLocations.has(requestedLocation)) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'This product is not on sale at that location' })
  }

  const window = bookingWindow(product.timezone)
  const sessions = await listSessions(db, {
    organizationId: product.organization_id, productId: product.id,
    fromInstant: window.fromInstant, toInstant: window.toInstant, statuses: ['scheduled'],
  })
  return {
    success: true,
    product: { id: product.id, name: product.name, slug },
    sessions: sessions
      .filter(session => onlineOnly ? session.location_id === null : (requestedLocation
        ? session.location_id === requestedLocation
        : session.location_id === null || sellingLocations.has(session.location_id)))
      .map(session => ({
        id: session.id, starts_at: session.starts_at, ends_at: session.ends_at, location_id: session.location_id,
        timezone: session.timezone, remaining: session.remaining, is_full: session.is_full,
        created_at: session.created_at,
      })),
  }
}

export async function listPublicOnlineProducts(db: DbClient, organizationId: string, previewAuthorized = false) {
  const organization = await queryFirst<{ default_currency: string }>(db, `SELECT default_currency FROM organization WHERE id = ? AND ${publicTenantVisibilitySql('organization', previewAuthorized)}`, [organizationId])
  if (!organization) throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
  if (!isCurrencyCode(organization.default_currency)) throw new HTTPError({ statusCode: 409, statusMessage: 'Configure the organization currency before offering consultations' })
  const products = (await listOrganizationProducts(db, { organizationId, publishedOnly: true })).filter(product => product.active && product.booking?.online_timezone)
  return { products, locations: [], currency: organization.default_currency }
}
