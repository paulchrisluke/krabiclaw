import type { Ref } from 'vue'
import type { Collection, Product } from '~/server/types/products'

/**
 * The organization's catalog — or one location's, when a location is named —
 * with the collections of that same scope, fetched once.
 *
 * Several levels need it at once: Catalog, Collections, one collection's
 * products and the title above them. Keyed `useAsyncData` means they share one
 * request and one cache entry, and a write in any of them refreshes all.
 *
 * The scope is the caller's explicit choice, never a remembered one: no
 * location is the whole organization's catalog and its site-wide collections,
 * a location is what that location offers and its own collections.
 */
export function useProductCatalog(organizationId: string, locationId: Ref<string | null>) {
  const dashboardApi = useDashboardApi()

  const isCollectionList = (value: unknown): value is { collections: Collection[] } =>
    isRecord(value) && Array.isArray(value.collections)
  const isProductList = (value: unknown): value is { success: true, products: Product[] } =>
    isRecord(value) && Array.isArray(value.products)

  const { data, pending, error, refresh } = useAsyncData(
    computed(() => `product-catalog:${organizationId}:${locationId.value ?? 'organization'}`),
    async () => {
      const id = locationId.value
      const [collectionResponse, productResponse] = await Promise.all([
        // Site-wide collections and one location's are different questions;
        // the empty value asks for the site-wide ones explicitly.
        dashboardApi(`/api/editor/organizations/${organizationId}/collections?location_id=${encodeURIComponent(id ?? '')}`, { validate: isCollectionList }),
        dashboardApi(id
          ? `/api/editor/organizations/${organizationId}/locations/${encodeURIComponent(id)}/products`
          : `/api/editor/organizations/${organizationId}/products`, { validate: isProductList }),
      ])
      return { collections: collectionResponse.collections, products: productResponse.products }
    },
  )

  const collections = computed(() => data.value?.collections ?? [])
  const products = computed(() => data.value?.products ?? [])

  return { collections, products, pending, error, refresh }
}
