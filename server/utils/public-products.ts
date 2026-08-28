import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { getPublicProductBySlug, listPublicSiteProducts } from '~/server/utils/product-management'
import type { Product, ProductPresentation } from '~/server/types/products'
import { resolveProductPresentation } from '~/utils/product-presentation'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'

interface PublicProductSiteRow {
  id: string
  organization_id: string
  brand_name: string
  vertical: string
  theme_id: string
  feature_overrides: string | null
  default_currency: string
}

export interface PublicProductLocation {
  id: string
  slug: string
  title: string
  feature_overrides: string | null
}

export interface PublicProductCollection {
  site: PublicProductSiteRow
  currency: CurrencyCode
  presentation: ProductPresentation
  locations: PublicProductLocation[]
  products: Product[]
}

export interface PublicProductDetail extends PublicProductCollection {
  location: PublicProductLocation
  product: Product
}

export interface PublicProductReview {
  id: string
  author: string
  rating: number
  title: string
  content: string
  createdAt: string
}

async function loadProductSite(db: DbClient, siteId: string, routeKind: 'menu' | 'products') {
  const site = await queryFirst<PublicProductSiteRow>(db, `
    SELECT id, organization_id, brand_name, vertical, theme_id, feature_overrides, default_currency
      FROM sites
     WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
       AND brand_name IS NOT NULL AND trim(brand_name) <> ''
     LIMIT 1
  `, [siteId])
  if (!site) return null
  const presentation = resolveProductPresentation(site.vertical)
  if (!presentation || presentation.locationCollectionSegment !== routeKind) return null
  if (!isCurrencyCode(site.default_currency)) throw new Error(`Unsupported site currency: ${site.default_currency}`)
  return { site, presentation, currency: site.default_currency }
}

function locationHasProducts(site: PublicProductSiteRow, location: PublicProductLocation): boolean {
  const { capabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
    siteEnabledFeatures: site.feature_overrides,
    locationEnabledFeatures: location.feature_overrides,
  })
  return capabilities.managers.some(manager => manager.key === 'location.products')
}

export async function loadPublicProductCollection(
  db: DbClient,
  siteId: string,
  routeKind: 'menu' | 'products',
  locationSlug?: string | null,
): Promise<PublicProductCollection | null> {
  const resolved = await loadProductSite(db, siteId, routeKind)
  if (!resolved) return null
  const locationRows = await queryAll<PublicProductLocation>(db, `
    SELECT id, slug, title, feature_overrides
      FROM business_locations
     WHERE organization_id = ? AND site_id = ? AND status = 'active'
       ${locationSlug ? 'AND slug = ?' : ''}
     ORDER BY is_primary DESC, title, id
  `, [resolved.site.organization_id, siteId, ...(locationSlug ? [locationSlug] : [])])
  if (locationSlug && locationRows.length !== 1) return null
  const locations = locationRows.filter(location => locationHasProducts(resolved.site, location))
  if (locationSlug && locations.length !== 1) return null
  const products = await listPublicSiteProducts(db, siteId, locations.map(location => location.id))
  return { ...resolved, locations, products }
}

export async function loadPublicProductDetail(
  db: DbClient,
  siteId: string,
  routeKind: 'menu' | 'products',
  locationSlug: string,
  productSlug: string,
): Promise<PublicProductDetail | null> {
  const collection = await loadPublicProductCollection(db, siteId, routeKind, locationSlug)
  const location = collection?.locations[0]
  if (!collection || !location) return null
  const product = await getPublicProductBySlug(db, siteId, location.id, productSlug)
  if (!product) return null
  return { ...collection, location, product }
}

export async function loadPublicProductApiCollection(
  db: DbClient,
  siteId: string,
  locationSlug?: string | null,
): Promise<PublicProductCollection | null> {
  const site = await queryFirst<{ vertical: string }>(db, `SELECT vertical FROM sites WHERE id = ? AND status = 'active' AND onboarding_status = 'active' LIMIT 1`, [siteId])
  const presentation = site ? resolveProductPresentation(site.vertical) : null
  if (!presentation) return null
  return loadPublicProductCollection(db, siteId, presentation.locationCollectionSegment, locationSlug)
}

export async function loadPublicProductApiDetail(
  db: DbClient,
  siteId: string,
  locationSlug: string,
  productSlug: string,
): Promise<PublicProductDetail | null> {
  const site = await queryFirst<{ vertical: string }>(db, `SELECT vertical FROM sites WHERE id = ? AND status = 'active' AND onboarding_status = 'active' LIMIT 1`, [siteId])
  const presentation = site ? resolveProductPresentation(site.vertical) : null
  if (!presentation) return null
  return loadPublicProductDetail(db, siteId, presentation.locationCollectionSegment, locationSlug, productSlug)
}

export async function loadPublicProductReviews(
  db: DbClient,
  detail: PublicProductDetail,
): Promise<PublicProductReview[]> {
  return queryAll<PublicProductReview>(db, `
    SELECT id, author_name AS author, rating, title, content, created_at AS createdAt
     FROM reviews
     WHERE product_id = ? AND organization_id = ? AND site_id = ? AND location_id = ? AND status = 'approved'
       AND author_name IS NOT NULL AND trim(author_name) <> ''
       AND title IS NOT NULL AND trim(title) <> ''
       AND content IS NOT NULL AND trim(content) <> ''
     ORDER BY created_at DESC, id DESC
     LIMIT 50
  `, [detail.product.id, detail.site.organization_id, detail.site.id, detail.location.id])
}
