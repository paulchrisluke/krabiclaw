import type { Ref } from 'vue'
import type { Collection, Product } from '~/server/types/products'

/**
 * One location's collections and the products offered there, fetched once.
 *
 * Three levels of the catalog chain need this at the same time — the
 * collection list, one collection's product list, and the level that titles
 * the column — and each used to fetch it for itself. Keyed `useAsyncData`
 * means they share one request and one cache entry, and a write in any of them
 * refreshes all three.
 */
export function useLocationProductCatalog(siteId: string, locationId: Ref<string | null>) {
  const dashboardApi = useDashboardApi()

  const isCollectionList = (value: unknown): value is { collections: Collection[] } =>
    isRecord(value) && Array.isArray(value.collections)
  const isProductList = (value: unknown): value is { success: true, products: Product[] } =>
    isRecord(value) && Array.isArray(value.products)

  const { data, pending, error, refresh } = useAsyncData(
    computed(() => `location-product-catalog:${siteId}:${locationId.value ?? 'missing'}`),
    async () => {
      const id = locationId.value
      // No location resolved yet is not an error — it is a request that has
      // nothing to ask for. The surfaces render their own empty state.
      if (!id) return { collections: [] as Collection[], products: [] as Product[] }
      const [collectionResponse, productResponse] = await Promise.all([
        // Collections scoped to this location, and the site-wide ones, are
        // different questions. This screen edits the location's own catalog,
        // so it asks for that scope explicitly.
        dashboardApi(`/api/editor/sites/${siteId}/collections?location_id=${encodeURIComponent(id)}`, { validate: isCollectionList }),
        dashboardApi(`/api/editor/sites/${siteId}/locations/${id}/products`, { validate: isProductList }),
      ])
      return { collections: collectionResponse.collections, products: productResponse.products }
    },
  )

  const collections = computed(() => data.value?.collections ?? [])
  const products = computed(() => data.value?.products ?? [])

  return { collections, products, pending, error, refresh }
}
