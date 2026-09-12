import { queryAll, queryFirst, type DbClient } from '~/server/db'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { getProductBySlug, hydrateProductMedia, listCollections, listLocationProducts } from '~/server/utils/product-management'
import type { Collection, Product, ProductBookingConfig, ProductPresentation } from '~/server/types/products'
import { resolveProductPresentation } from '~/utils/product-presentation'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'
import {
  loadExactPublicLocalizations,
  projectExactLocalizedCollection,
  projectExactLocalizedResource,
  projectLocalizedMediaAlt,
  resolveLocalizedRouteResourceId,
} from '~/server/utils/public-localization'
import { listPublicLocaleRepresentations } from '~/server/utils/public-locale-representations'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

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
  /**
   * Site and location collections, in merchandising order. These replace the
   * old per-location category, so a template groups by explicit membership
   * rather than by a column copied onto every product.
   */
  collections: Collection[]
}

/** What the page needs to know about this product's booking capability. */
export type PublicProductBooking = ProductBookingConfig

export interface PublicProductDetail extends PublicProductCollection {
  location: PublicProductLocation
  product: Product
  /**
   * Present exactly when the Product takes bookings.
   *
   * The existence of the config row is the capability — not a non-null
   * duration, not the vertical, not a type discriminator. `null` means this
   * page shows no booking affordance at all, which is different from a
   * bookable Product with nothing scheduled.
   */
  booking: PublicProductBooking | null
  localeRepresentations: PublicLocaleRepresentation[]
}

export interface PublicProductReview {
  id: string
  author: string
  rating: number
  title: string
  content: string
  createdAt: string
}

// previewAuthorized carries the site's one preview authorization down from the
// request: a site that has not finished onboarding is readable only with it.
async function loadProductSite(db: DbClient, siteId: string, routeKind: 'menu' | 'products', previewAuthorized: boolean) {
  const site = await queryFirst<PublicProductSiteRow>(db, `
    SELECT id, organization_id, brand_name, vertical, theme_id, feature_overrides, default_currency
      FROM sites
     WHERE id = ? AND status = 'active'${previewAuthorized ? '' : " AND onboarding_status = 'active'"}
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
  previewAuthorized: boolean,
  locationSlug?: string | null,
): Promise<PublicProductCollection | null> {
  const resolved = await loadProductSite(db, siteId, routeKind, previewAuthorized)
  if (!resolved) return null
  const locationRows = await queryAll<PublicProductLocation>(db, `
    SELECT id, slug, title, feature_overrides
      FROM business_locations
     WHERE organization_id = ? AND site_id = ? AND status = 'active'
       ${locationSlug ? 'AND slug = ?' : ''}
     ORDER BY title, id
  `, [resolved.site.organization_id, siteId, ...(locationSlug ? [locationSlug] : [])])
  if (locationSlug && locationRows.length !== 1) return null
  const locations = locationRows.filter(location => locationHasProducts(resolved.site, location))
  if (locationSlug && locations.length !== 1) return null
  // Location publication is the public gate here: a product carried by the
  // site but withheld at this branch is absent, not shown greyed out.
  const perLocation = await Promise.all(locations.map(location =>
    listLocationProducts(db, { organizationId: resolved.site.organization_id, locationId: location.id, publishedOnSiteId: siteId })))
  const seen = new Set<string>()
  const products = await hydrateProductMedia(db, siteId, perLocation.flat().filter((product) => {
    if (seen.has(product.id)) return false
    seen.add(product.id)
    return true
  }))
  const collections = (await Promise.all([
    listCollections(db, { organizationId: resolved.site.organization_id, siteId, locationId: null }),
    ...locations.map(location => listCollections(db, { organizationId: resolved.site.organization_id, siteId, locationId: location.id })),
  ])).flat()
  return { ...resolved, locations, products, collections }
}

export async function loadPublicProductDetail(
  db: DbClient,
  siteId: string,
  routeKind: 'menu' | 'products',
  previewAuthorized: boolean,
  locationSlug: string,
  productSlug: string,
  locale = 'en',
): Promise<PublicProductDetail | null> {
  if (locale === 'en') {
    const collection = await loadPublicProductCollection(db, siteId, routeKind, previewAuthorized, locationSlug)
    const location = collection?.locations[0]
    if (!collection || !location) return null
    const found = await getProductBySlug(db, collection.site.organization_id, productSlug)
    // The product must be published on this site and actually offered at this
    // location: reaching it by slug alone would render a branch's page for
    // something the site withholds, or something that branch does not sell.
    const offeredHere = found?.locations.some(entry => entry.location_id === location.id && entry.published && entry.active)
    const publishedHere = found?.publications.some(entry => entry.site_id === siteId && entry.published)
    if (!found || !offeredHere || !publishedHere) return null
    const [product] = await hydrateProductMedia(db, siteId, [found])
    if (!product) return null
    const localeRepresentations = await listPublicLocaleRepresentations(db, {
      organizationId: collection.site.organization_id,
      siteId,
      sourcePath: collection.presentation.productPath(location.slug, product.slug),
      resource: { type: 'product', id: product.id },
    })
    return {
      ...collection,
      location,
      product,
      booking: product.booking,
      localeRepresentations,
    }
  }

  const resolved = await loadProductSite(db, siteId, routeKind, previewAuthorized)
  if (!resolved) return null
  const localizations = await loadExactPublicLocalizations(db, resolved.site.organization_id, siteId, locale)
  const localizedLocationPath = `/${locale}/locations/${locationSlug}`
  const locationId = resolveLocalizedRouteResourceId(localizations, 'business_location', localizedLocationPath)
  if (!locationId) return null
  const sourceLocation = await queryFirst<PublicProductLocation>(db, `
    SELECT id, slug, title, feature_overrides FROM business_locations
     WHERE organization_id = ? AND site_id = ? AND id = ? AND status = 'active' LIMIT 1
  `, [resolved.site.organization_id, siteId, locationId])
  if (!sourceLocation) return null
  const collection = await loadPublicProductCollection(db, siteId, routeKind, previewAuthorized, sourceLocation.slug)
  const location = collection?.locations[0]
  if (!collection || !location) return null
  // The Product is named by the same slug its English route names: a Product
  // reaches the public through each location that offers it, so its localized
  // route is that location's route under a locale prefix, not a stored path of
  // its own.
  const sourceProduct = collection.products.find(product => product.slug === productSlug)
  const locationLocalization = localizations.find(item => item.resourceType === 'business_location' && item.resourceId === location.id)
  const productLocalization = localizations.find(item => item.resourceType === 'product' && item.resourceId === sourceProduct?.id)
  const siteLocalization = localizations.find(item => item.resourceType === 'site' && item.resourceId === siteId)
  if (!sourceProduct || !locationLocalization || !productLocalization) return null
  const localizedProduct = projectExactLocalizedResource('product', sourceProduct, productLocalization)
  const product = {
    ...localizedProduct,
    image: localizedProduct.image
      ? projectLocalizedMediaAlt([localizedProduct.image], localizations)[0] ?? null
      : null,
    gallery: projectLocalizedMediaAlt(localizedProduct.gallery, localizations),
  }
  const localizedLocation = projectExactLocalizedResource('business_location', location, locationLocalization)
  const localizedSite = siteLocalization
    ? projectExactLocalizedResource('site', collection.site, siteLocalization)
    : { ...collection.site, brand_name: '' }
  const localeRepresentations = await listPublicLocaleRepresentations(db, {
    organizationId: collection.site.organization_id,
    siteId,
    sourcePath: collection.presentation.productPath(location.slug, sourceProduct.slug),
    resource: { type: 'product', id: sourceProduct.id },
  })
  return {
    ...collection,
    site: localizedSite,
    locations: projectExactLocalizedCollection('business_location', collection.locations, localizations),
    products: projectExactLocalizedCollection('product', collection.products, localizations),
    collections: projectExactLocalizedCollection('collection', collection.collections, localizations),
    location: localizedLocation,
    product,
    booking: sourceProduct.booking,
    localeRepresentations,
  }
}

export async function loadPublicProductApiCollection(
  db: DbClient,
  siteId: string,
  previewAuthorized: boolean,
  locationSlug?: string | null,
): Promise<PublicProductCollection | null> {
  const site = await queryFirst<{ vertical: string }>(db, `SELECT vertical FROM sites WHERE id = ? AND status = 'active'${previewAuthorized ? '' : " AND onboarding_status = 'active'"} LIMIT 1`, [siteId])
  const presentation = site ? resolveProductPresentation(site.vertical) : null
  if (!presentation) return null
  return loadPublicProductCollection(db, siteId, presentation.locationCollectionSegment, previewAuthorized, locationSlug)
}

export async function loadPublicProductApiDetail(
  db: DbClient,
  siteId: string,
  previewAuthorized: boolean,
  locationSlug: string,
  productSlug: string,
  locale = 'en',
): Promise<PublicProductDetail | null> {
  const site = await queryFirst<{ vertical: string }>(db, `SELECT vertical FROM sites WHERE id = ? AND status = 'active'${previewAuthorized ? '' : " AND onboarding_status = 'active'"} LIMIT 1`, [siteId])
  const presentation = site ? resolveProductPresentation(site.vertical) : null
  if (!presentation) return null
  return loadPublicProductDetail(db, siteId, presentation.locationCollectionSegment, previewAuthorized, locationSlug, productSlug, locale)
}

export async function loadPublicProductReviews(
  db: DbClient,
  detail: PublicProductDetail,
): Promise<PublicProductReview[]> {
  return queryAll<PublicProductReview>(db, `
    SELECT id, author_name AS author, rating, title, content, created_at AS createdAt
     FROM reviews
     WHERE product_id = ? AND organization_id = ? AND site_id = ? AND status = 'approved'
       AND author_name IS NOT NULL AND trim(author_name) <> ''
       AND title IS NOT NULL AND trim(title) <> ''
       AND content IS NOT NULL AND trim(content) <> ''
     ORDER BY created_at DESC, id DESC
     LIMIT 50
  `, [detail.product.id, detail.site.organization_id, detail.site.id])
}
