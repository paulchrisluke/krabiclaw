<template>
  <!--
    Catalog opens on its groupings — a restaurant's Sections, everyone else's
    Collections — in the order customers see them, the way a menu reads. Each
    opens its products; All items is the whole scope in one list. A catalog with
    no groupings yet is just its items.
  -->
  <DashboardIndexPanel id="catalog" title="Catalog">
    <template #right>
      <UButton v-if="!scopes.length" :to="addCollectionTo" icon="i-lucide-layout-list" color="neutral" variant="ghost" square :aria-label="`Add a ${presentation.collectionGroupLabel.toLowerCase()}`" data-testid="catalog-add-collection" />
      <UButton :to="addTo" icon="i-lucide-plus" color="neutral" variant="soft" square aria-label="Add" data-testid="catalog-add" />
    </template>

    <div v-if="locations.length > 1" class="mb-6 flex">
      <USelect
        :model-value="locationId ?? ALL_LOCATIONS"
        :items="locationItems"
        size="sm"
        class="min-w-40"
        aria-label="Location"
        @update:model-value="setLocation"
      />
    </div>

    <UAlert v-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Catalog could not be loaded" :description="loadError" />
    <div v-else-if="scopes.length" class="space-y-10">
      <section v-for="scope in scopes" :key="scope.id ?? 'site'">
        <h2 v-if="scopes.length > 1" class="px-1 text-sm font-semibold text-muted">{{ scope.title }}</h2>
        <CollectionList :scope="scope.id" :title="scope.title" :description="`Customers see ${presentation.collectionGroupLabelPlural.toLowerCase()} in this order.`" />
      </section>
      <EditorNavigationList :groups="allItemsGroup" :active-item="level.child.value" />
    </div>
    <CatalogProductList v-else :products="catalog.products.value" :path="level.path.value" :price-label="priceLabel" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import CatalogProductList from '~/components/dashboard/CatalogProductList.vue'
import CollectionList from '~/components/dashboard/CollectionList.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { useCatalogPrice } from '~/composables/useCatalogPrice'
import { getErrorMessage } from '~/utils/errors'
import { PRODUCT_KINDS } from '~/shared/product-details'
import { requireProductPresentation } from '~/utils/product-presentation'

const route = useRoute()
const router = useRouter()
// The level runs while setup is still synchronous: it injects the record the
// `<RouterView>` above rendered, and an `await` before it would bind nothing.
const level = useRouteLevel()
const dashboard = useDashboardOrganization()
const organizationId = await useDashboardOrganizationId()
const locationId = useLocationScope()
const catalog = useProductCatalog(organizationId, locationId)
// Catalog is the level that opens the catalog; every level below shares the loaded entry.
await catalog.load
const presentation = computed(() => requireProductPresentation(dashboard.organization.value?.vertical, dashboard.organization.value?.theme_id))

/** A path in this catalog's scope: the explicit location rides along. */
function scoped(path: string, query: Record<string, string | undefined> = {}) {
  return router.resolve({ path, query: { location_id: locationId.value ?? undefined, ...query } }).fullPath
}
// Adding asks for the kind first; a list filtered to one kind already knows it.
const kindFilter = computed(() => PRODUCT_KINDS.find(kind => kind === route.query.kind) ?? null)
const addTo = computed(() => kindFilter.value
  ? scoped(`${level.path.value}/new/name`, { kind: kindFilter.value })
  : scoped(`${level.path.value}/new/kind`))
const addCollectionTo = computed(() => scoped(`${level.path.value}/collections/new`))

// The organization's locations, so a scope can be chosen and a scope that
// names somebody else's location is refused.
const { locations, error: locationsError, pending: locationsPending } = await useOrganizationLocations()
const ALL_LOCATIONS = 'all'
const locationItems = computed(() => [{ label: 'All locations', value: ALL_LOCATIONS }, ...locations.value.map(location => ({ label: location.title, value: location.id }))])
function setLocation(value: string) {
  void navigateTo(router.resolve({ path: level.path.value, query: { ...route.query, location_id: value === ALL_LOCATIONS ? undefined : value } }).fullPath)
}
watchEffect(() => {
  if (level.mode.value === 'yield' || !locationId.value || locationsPending.value || locationsError.value) return
  if (!locations.value.some(location => location.id === locationId.value)) showError(createError({ statusCode: 404, statusMessage: 'Location not found' }))
})

const loadError = computed(() => {
  const cause = catalog.error.value ?? locationsError.value
  return cause ? getErrorMessage(cause, 'The catalog could not be loaded') : null
})

/**
 * The groupings this scope shows, one list per owner of an order: a location
 * shows its own and the site-wide ones, as its public page does; the whole
 * organization shows every location's, as the public menu does.
 */
const scopes = computed(() => {
  const owners = new Set(catalog.collections.value.map(row => row.location_id))
  const visible = [null, ...(locationId.value ? [locationId.value] : locations.value.map(location => location.id))]
    .filter(id => owners.has(id))
  const single = visible.length === 1
  return visible.map(id => ({
    id,
    title: single ? presentation.value.collectionGroupLabelPlural : (id === null ? 'All locations' : locations.value.find(location => location.id === id)?.title ?? id),
  }))
})

const { priceLabel } = useCatalogPrice(locationId, locations)
const allItemsGroup = computed<EditorNavigationGroup[]>(() => [{
  id: 'all',
  items: [{
    id: 'all',
    label: 'All items',
    summary: catalog.products.value.length === 1 ? '1 item' : `${catalog.products.value.length} items`,
    lead: { icon: 'i-lucide-layout-grid' },
    to: scoped(`${level.path.value}/all`),
  }],
}])

useSeoMeta({ title: 'Catalog | Krabiclaw Dashboard', robots: 'noindex, nofollow' })
</script>
