import type { Ref } from 'vue'
import type { Collection, Product } from '~/server/types/products'

/**
 * The organization's catalog — or one location's, when a location is named —
 * with every collection on the site, fetched once.
 *
 * Several levels need it at once: Catalog, Collections, one collection's
 * products and the title above them. Keyed `useAsyncData` means they share one
 * request and one cache entry, and a write in any of them refreshes all.
 *
 * The scope is the caller's explicit choice, never a remembered one: no
 * location is the whole organization's catalog, a location is what that
 * location offers. Collections are always all of them, each carrying the
 * location it belongs to (null for site-wide) — the same set the public menu
 * reads — and a screen shows the ones for its scope.
 *
 * The level that opens the catalog awaits `load`, so it renders complete; the
 * levels below it share the loaded entry.
 */
export function useProductCatalog(organizationId: string, locationId: Ref<string | null>) {
  const dashboardApi = useDashboardApi()

  const isCollectionList = (value: unknown): value is { collections: Collection[] } =>
    isRecord(value) && Array.isArray(value.collections)
  const isProductList = (value: unknown): value is { success: true, products: Product[] } =>
    isRecord(value) && Array.isArray(value.products)

  const load = useAsyncData(
    computed(() => `product-catalog:${organizationId}:${locationId.value ?? 'organization'}`),
    async () => {
      const id = locationId.value
      const [collectionResponse, productResponse] = await Promise.all([
        dashboardApi(`/api/editor/organizations/${organizationId}/collections`, { validate: isCollectionList }),
        dashboardApi(id
          ? `/api/editor/organizations/${organizationId}/locations/${encodeURIComponent(id)}/products`
          : `/api/editor/organizations/${organizationId}/products`, { validate: isProductList }),
      ])
      return { collections: collectionResponse.collections, products: productResponse.products }
    },
  )
  const { data, pending, error, refresh } = load

  const collections = computed(() => data.value?.collections ?? [])
  const products = computed(() => data.value?.products ?? [])

  return { load, collections, products, pending, error, refresh }
}
