import { refreshProductBusy } from '~/server/domain/member-scheduling'
import type { CloudflareEnv } from '~/server/utils/auth'
import { HTTPError } from 'nitro'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { bookingWindow, listSessions } from '~/server/utils/availability'
import { getProductBySlug, listOrganizationProducts, productBookingReadiness } from '~/server/utils/product-management'
import { isCurrencyCode } from '~/shared/currencies'
import { publicTenantVisibilitySql } from '~/server/utils/public-base'

export async function listPublicBookingSessions(db: DbClient, organizationId: string, slug: string, env: CloudflareEnv, requestedScope?: unknown) {
  const product = await getProductBySlug(db, organizationId, slug)
  if (!product?.active || !product.publications.some(publication => publication.organization_id === organizationId && publication.published)
    || (!product.order_url && !product.booking) || (product.kind === 'experience' && !(await productBookingReadiness(db, organizationId, product)).ready)) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Product not found' })
  }
  if (product.order_url) return { success: true, product: { id: product.id, name: product.name, slug }, sessions: [] }

  // A session belongs to a location, and a branch that has stopped selling
  // this product does not offer its occurrences either.
  const sellingLocations = new Map((await queryAll<{ location_id: string; timezone: string | null }>(db, `
    SELECT pl.location_id, l.timezone FROM product_locations pl
      JOIN business_locations l ON l.id = pl.location_id AND l.organization_id = ? AND l.status = 'active'
     WHERE pl.product_id = ? AND pl.active = 1 AND pl.published = 1
  `, [organizationId, product.id])).map(row => [row.location_id, row.timezone]))

  const onlineOnly = requestedScope === 'online'
  const requestedLocation = typeof requestedScope === 'string' && !onlineOnly ? requestedScope : null
  if (requestedLocation && !sellingLocations.has(requestedLocation)) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'This product is not on sale at that location' })
  }

  await refreshProductBusy(db,env,organizationId,product.id)
  const zones = requestedLocation ? [sellingLocations.get(requestedLocation)] : onlineOnly ? [product.booking?.online_timezone] : [...sellingLocations.values(), product.booking?.online_timezone].filter(zone => zone != null)
  if (!zones.length || zones.some(zone => !zone)) throw new HTTPError({ statusCode: 409, statusMessage: 'Set the online or location timezone before offering sessions' })
  const windows = zones.map(zone => bookingWindow(zone!))
  const fromInstant = windows.map(window => window.fromInstant).sort()[0]!
  const toInstant = windows.map(window => window.toInstant).sort().at(-1)!
  const sessions = await listSessions(db, {
    organizationId: product.organization_id, productId: product.id,
    fromInstant, toInstant, statuses: ['scheduled'],
  })
  return {
    success: true,
    product: { id: product.id, name: product.name, slug },
    sessions: sessions
      .filter(session => { const window = bookingWindow(session.timezone); return session.starts_at >= window.fromInstant && session.starts_at < window.toInstant })
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
  const products = (await listOrganizationProducts(db, { organizationId, publishedOnly: true })).filter(product => product.active && (product.booking?.online_timezone || product.order_url))
  return { products, locations: [], currency: organization.default_currency }
}
