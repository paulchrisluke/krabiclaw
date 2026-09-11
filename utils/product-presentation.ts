import type { Collection, Product, ProductPresentation } from '~/server/types/products'
import { normalizeVertical } from '~/utils/vertical-copy'

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

export interface ProductCollectionGroup {
  id: string
  name: string
  sort_order: number
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
        products: positions
          ? products
              .filter(product => positions.has(product.id))
              .sort((left, right) => (positions.get(left.id)! - positions.get(right.id)!) || left.name.localeCompare(right.name))
          : [],
      }
    })
    .filter(group => group.products.length > 0)
}
