import type { Collection, Product, ProductPresentation, ProductSurface } from '~/server/types/products'
import { normalizeVertical } from '~/utils/vertical-copy'
import { isMediaCategory, type MediaCategory } from '~/shared/media-placement-contract'

/**
 * Anything a guest books a seat on is an Experience, whatever the site sells
 * otherwise.
 *
 * The booking configuration row IS the capability — server/db/schema.ts says
 * so, and it is what the merchant switches on. A restaurant with a teppanyaki
 * counter keeps its Menu and gains an Experiences page; a studio's clay and
 * its t-shirts are not the same page. This reads the same fact the old
 * category type column recorded: on production every product that came across
 * from an 'experience' category takes bookings, and none of the 380 'standard'
 * ones do.
 */
export function isExperience(product: Pick<Product, 'booking'>): boolean {
  return product.booking !== null
}

export function productSurfaceOf(vertical: string | null | undefined, product: Pick<Product, 'booking'>): ProductSurface {
  return isExperience(product) ? 'experiences' : requireProductPresentation(vertical).locationCollectionSegment
}

/**
 * Experiences read the same on every vertical, so they have one presentation
 * rather than one per vertical. The page is the site's, not a branch's: an
 * experience is named by its own slug, the way it was printed on the card the
 * guest is holding.
 */
export const EXPERIENCE_PRESENTATION: ProductPresentation = {
  feature: 'products',
  collectionPath: '/experiences',
  locationCollectionSegment: 'experiences',
  productPath: (_locationSlug, productSlug) => `/experiences/${encodeURIComponent(productSlug)}`,
  collectionLabel: 'Experiences',
  itemLabel: 'Experience',
  itemLabelPlural: 'Experiences',
  collectionGroupLabel: 'Collection',
  collectionGroupLabelPlural: 'Collections',
  structuredDataType: 'Product',
}

/** The surface this product is read on, and the paths and words that go with it. */
export function presentationForProduct(vertical: string | null | undefined, product: Pick<Product, 'booking'>): ProductPresentation {
  return isExperience(product) ? EXPERIENCE_PRESENTATION : requireProductPresentation(vertical)
}

/** The words one surface owns: experiences read the same on every vertical. */
export function presentationForSurface(vertical: string | null | undefined, surface: ProductSurface): ProductPresentation {
  return surface === 'experiences' ? EXPERIENCE_PRESENTATION : requireProductPresentation(vertical)
}

export function resolveProductPresentation(vertical: string | null | undefined): ProductPresentation | null {
  if (vertical === null || vertical === undefined || vertical.trim() === '') return null
  const normalized = normalizeVertical(vertical)
  if (normalized === 'restaurant') {
    return {
      feature: 'products',
      collectionPath: '/menu',
      locationCollectionSegment: 'menu',
      productPath: (locationSlug, productSlug) => `/locations/${encodeURIComponent(locationSlug)}/menu/${encodeURIComponent(productSlug)}`,
      collectionLabel: 'Menu',
      itemLabel: 'Dish',
      itemLabelPlural: 'Dishes',
      collectionGroupLabel: 'Section',
      collectionGroupLabelPlural: 'Sections',
      structuredDataType: 'MenuItem',
    }
  }
  if (normalized === 'experience') {
    return {
      feature: 'products',
      collectionPath: '/products',
      locationCollectionSegment: 'products',
      productPath: (locationSlug, productSlug) => `/locations/${encodeURIComponent(locationSlug)}/products/${encodeURIComponent(productSlug)}`,
      collectionLabel: 'Products',
      itemLabel: 'Product',
      itemLabelPlural: 'Products',
      collectionGroupLabel: 'Collection',
      collectionGroupLabelPlural: 'Collections',
      structuredDataType: 'Product',
    }
  }
  return null
}

export function requireProductPresentation(vertical: string | null | undefined): ProductPresentation {
  const presentation = resolveProductPresentation(vertical)
  if (!presentation) throw new Error(`Products are not presented for vertical: ${normalizeVertical(vertical)}`)
  return presentation
}

export function productLocationCollectionPath(vertical: string | null | undefined, locationSlug: string): string {
  const presentation = requireProductPresentation(vertical)
  return `/locations/${encodeURIComponent(locationSlug)}/${presentation.locationCollectionSegment}`
}

/**
 * A catalog measured the only way a surface can be read off it: how many
 * products it holds, and how many of those take bookings. The rows give this,
 * and so does one aggregate query — the hub counts a 365-item menu in SQL
 * rather than downloading it.
 */
export interface CatalogCounts {
  total: number
  experiences: number
}

export function countCatalog(products: ReadonlyArray<Pick<Product, 'booking'>>): CatalogCounts {
  return { total: products.length, experiences: products.filter(isExperience).length }
}

/**
 * What a catalog spanning more than one surface is called.
 *
 * A restaurant that also sells seats at its chef's counter has a Menu and it
 * has Experiences; neither word covers the other, and calling the pair "Menu"
 * is what filed bookable experiences as a menu section. The surfaces keep
 * their own words one level down.
 */
/**
 * The photo categories a vertical actually has. The column stores one of a
 * fixed set, but which of them mean anything is the tenant's business: a law
 * firm was offered "Food" and "Menu" filters because the list was written out
 * by hand in the photos page.
 *
 * A category already stored on an asset is always offered, whatever the
 * vertical — a site that changed vertical, or media added over MCP, must not
 * have pictures that no filter can reach.
 */
// The tenant's word for each subject the column can hold. Keyed by the shared
// list, so a category added there must be named here or this stops compiling.
const PHOTO_CATEGORY_LABELS: Record<MediaCategory, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
  food: 'Food',
  menu: 'Menu',
  team: 'Team',
  other: 'Other',
  logo: 'Logo',
  blog: 'Article',
}

/** Which subjects each vertical is offered. Only a restaurant plates food. */
const PHOTO_CATEGORIES_BY_VERTICAL: Record<string, readonly MediaCategory[]> = {
  restaurant: ['exterior', 'interior', 'food', 'menu', 'team', 'other'],
  experience: ['exterior', 'interior', 'team', 'other'],
  service: ['exterior', 'interior', 'team', 'other'],
}

export function photoCategories(
  vertical: string | null | undefined,
  stored: Iterable<string | null | undefined> = [],
): Array<{ id: MediaCategory, label: string }> {
  const forVertical = PHOTO_CATEGORIES_BY_VERTICAL[normalizeVertical(vertical)] ?? PHOTO_CATEGORIES_BY_VERTICAL.service!
  const ids = [...forVertical]
  // A subject already on an asset is always offered, whatever the vertical: a
  // site that changed vertical, or media added over MCP, must not have pictures
  // no filter can reach.
  for (const category of stored) {
    if (isMediaCategory(category) && !ids.includes(category)) ids.push(category)
  }
  return ids.map(id => ({ id, label: PHOTO_CATEGORY_LABELS[id] }))
}

export const CATALOG_LABEL = 'Catalog'

/**
 * The surfaces a location's catalog spans, in reading order: the vertical's
 * own goods first, then anything bookable. A catalog with nothing in it still
 * reads as the vertical's own surface — that is the surface a first product
 * would land on.
 */
export function catalogSurfaces(vertical: string | null | undefined, counts: CatalogCounts): ProductSurface[] {
  const own = requireProductPresentation(vertical).locationCollectionSegment
  const surfaces: ProductSurface[] = []
  if (counts.total > counts.experiences) surfaces.push(own)
  if (counts.experiences > 0) surfaces.push('experiences')
  return surfaces.length > 0 ? surfaces : [own]
}

/** What to call the whole catalog: one surface speaks for it, two do not. */
export function catalogLabel(vertical: string | null | undefined, counts: CatalogCounts): string {
  const surfaces = catalogSurfaces(vertical, counts)
  return surfaces.length === 1 ? presentationForSurface(vertical, surfaces[0]!).collectionLabel : CATALOG_LABEL
}

/**
 * The catalog counted in the merchant's own words, one count per surface:
 * "24 dishes · 3 experiences". Plurals are each presentation's own, because
 * appending an "s" is how "dishs" reaches a merchant's screen.
 */
export function catalogSummary(vertical: string | null | undefined, counts: CatalogCounts): string {
  const surfaces = catalogSurfaces(vertical, counts)
  if (counts.total === 0) return `Add your first ${presentationForSurface(vertical, surfaces[0]!).itemLabel.toLowerCase()}`
  return surfaces.map((surface) => {
    const words = presentationForSurface(vertical, surface)
    const total = surface === 'experiences' ? counts.experiences : counts.total - counts.experiences
    return `${total} ${(total === 1 ? words.itemLabel : words.itemLabelPlural).toLowerCase()}`
  }).join(' · ')
}

/**
 * Whether a route segment names a surface this vertical's catalog is managed
 * on. Anything else is not a page: a location sells its own goods and, where
 * it takes bookings, experiences — nothing else.
 */
export function isCatalogSurface(vertical: string | null | undefined, segment: string): segment is ProductSurface {
  return segment === 'experiences' || segment === requireProductPresentation(vertical).locationCollectionSegment
}

/**
 * The collections a merchant manages on one surface, holding only the members
 * that are on it.
 *
 * The surface belongs to the product, not to the collection: a product takes
 * bookings, so it is an Experience, or it is the vertical's own goods. Nothing
 * is stored on a collection to say which surface it is on, because a collection
 * can hold both — a chef's counter with dishes on the menu and a bookable
 * omakase beside them is one collection the owner named once.
 *
 * So a collection appears on every surface it has a member on, carrying that
 * surface's members and no others. This is what `loadPublicProductCollection`
 * already does for the public pages, which filter products by surface and then
 * drop the collections left empty: `/menu` never shows the omakase and
 * `/experiences` never shows the dishes. The CMS reads the catalog the same way
 * so an owner edits what a customer sees.
 *
 * A collection with nothing in it is on no surface yet, so it is offered on
 * every one of them rather than disappearing from the screen it was created on.
 */
export function collectionsOnSurface<
  P extends Pick<Product, 'booking'>,
  T extends { products: readonly P[] },
>(
  vertical: string | null | undefined,
  rows: readonly T[],
  surface: ProductSurface,
): Array<T & { products: P[] }> {
  return rows.flatMap((row) => {
    const products = row.products.filter(product => productSurfaceOf(vertical, product) === surface)
    if (row.products.length > 0 && products.length === 0) return []
    return [{ ...row, products }]
  })
}

export interface ProductCollectionGroup {
  id: string
  name: string
  sort_order: number
  /** The location whose collection this is, or null for a site-wide one. */
  location_id: string | null
  products: Product[]
}

/**
 * One group per collection, in the merchant's order, with the product order
 * they chose inside it.
 *
 * A product in two collections appears in both, once each — that is what
 * membership means. Products in no collection are not silently dropped into an
 * "other" bucket they were never put in; they are simply not grouped, because
 * a grouping built from collections has nowhere to put them.
 *
 * Both the collection page and the home page's preview read their order from
 * here, so the order a merchant arranges is the order every surface shows.
 */
export function groupProductsByCollection(
  products: readonly Product[],
  collections: readonly Collection[],
): ProductCollectionGroup[] {
  const positionFor = new Map<string, Map<string, number>>()
  for (const product of products) {
    for (const membership of product.collections) {
      const positions = positionFor.get(membership.collection_id) ?? new Map<string, number>()
      positions.set(product.id, membership.sort_order)
      positionFor.set(membership.collection_id, positions)
    }
  }
  return collections
    .map((collection) => {
      const positions = positionFor.get(collection.id)
      return {
        id: collection.id,
        name: collection.name,
        sort_order: collection.sort_order,
        location_id: collection.location_id,
        products: positions
          ? products
              .filter(product => positions.has(product.id))
              .sort((left, right) => (positions.get(left.id)! - positions.get(right.id)!) || left.name.localeCompare(right.name))
          : [],
      }
    })
    .filter(group => group.products.length > 0)
}
