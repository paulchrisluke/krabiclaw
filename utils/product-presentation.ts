import type { ProductPresentation } from '~/server/types/products'
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
      categoryLabel: 'Section',
      categoryLabelPlural: 'Sections',
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
      categoryLabel: 'Category',
      categoryLabelPlural: 'Categories',
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
