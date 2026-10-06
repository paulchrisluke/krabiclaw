<template>
  <!--
    Catalog: everything the organization offers, whatever its kind — dishes,
    experiences, services and products in one list, the way Airbnb's Listings
    holds homes and experiences. Every row opens the one Product editor.
  -->
  <DashboardIndexPanel id="catalog" title="Catalog">
    <template #right>
      <UButton :to="scoped(`${level.path.value}/collections`)" icon="i-lucide-layout-list" color="neutral" variant="ghost" square aria-label="Collections" data-testid="catalog-collections" />
      <UButton :to="addTo" icon="i-lucide-plus" color="neutral" variant="soft" square aria-label="Add" data-testid="catalog-add" />
    </template>

    <div class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        v-for="filter in kindFilters"
        :key="filter.value"
        :to="filterTo(filter.value)"
        :label="filter.label"
        size="sm"
        color="neutral"
        :variant="kind === filter.value ? 'solid' : 'outline'"
        class="rounded-full"
        :aria-pressed="kind === filter.value"
      />
      <USelect
        v-if="locations.length"
        :model-value="locationId ?? ALL_LOCATIONS"
        :items="locationItems"
        size="sm"
        class="ml-auto min-w-40"
        aria-label="Location"
        @update:model-value="setLocation"
      />
    </div>

    <UAlert v-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Catalog could not be loaded" :description="loadError" />
    <div v-else-if="catalog.pending.value && !catalog.products.value.length" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-20 rounded-2xl" />
    </div>
    <div v-else-if="!rows.length" class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
      <UIcon name="i-lucide-layout-grid" class="mx-auto size-6 text-muted" />
      <h2 class="mt-5 text-base font-semibold text-highlighted">No {{ activeFilterLabel.toLowerCase() }} yet</h2>
    </div>
    <EditorNavigationList v-else :groups="groups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import type { Product } from '~/server/types/products'
import { PRODUCT_KINDS, PRODUCT_KIND_LABELS, type ProductKind } from '~/shared/product-details'
import { isCurrencyCode } from '~/shared/currencies'
import { selectPrice } from '~/shared/prices'
import { mediaStillUrl } from '~/shared/media-placement-contract'
import { formatProductMoney } from '~/utils/product-money'
import { getErrorMessage } from '~/utils/errors'

const route = useRoute()
const router = useRouter()
// The level runs while setup is still synchronous: it injects the record the
// `<RouterView>` above rendered, and an `await` before it would bind nothing.
const level = useRouteLevel()
const dashboard = useDashboardOrganization()
const organizationId = await useDashboardOrganizationId()
const locationId = useLocationScope()
const catalog = useProductCatalog(organizationId, locationId)
const rawCurrency = dashboard.organization.value?.default_currency
if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported organization currency' })
const currency = rawCurrency

// Kind is the product's own, so the filters are kinds, named the same on every
// template. `item` is the generic kind and reads as Products.
const KIND_FILTER_LABELS: Record<ProductKind, string> = { dish: 'Menu items', experience: 'Experiences', service: 'Services', item: 'Products' }
const kind = computed<ProductKind | 'all'>(() => PRODUCT_KINDS.includes(route.query.kind as ProductKind) ? route.query.kind as ProductKind : 'all')
// A filter for every kind this catalog holds; a kind nobody sells is not a choice.
const kindFilters = computed(() => [
  { value: 'all' as const, label: 'All' },
  ...PRODUCT_KINDS.filter(value => value === kind.value || catalog.products.value.some(product => product.kind === value)).map(value => ({ value, label: KIND_FILTER_LABELS[value] })),
])
const activeFilterLabel = computed(() => kind.value === 'all' ? 'Products' : KIND_FILTER_LABELS[kind.value])

/** A path in this catalog's scope: the explicit location and kind ride along, nothing else does. */
function scoped(path: string, query: Record<string, string | undefined> = {}) {
  return router.resolve({ path, query: { location_id: locationId.value ?? undefined, ...query } }).fullPath
}
function filterTo(value: ProductKind | 'all') {
  return scoped(level.path.value, { kind: value === 'all' ? undefined : value })
}
// Adding asks for the kind first; a filtered catalog already knows it.
const addTo = computed(() => kind.value === 'all'
  ? scoped(`${level.path.value}/new/kind`)
  : scoped(`${level.path.value}/new/name`, { kind: kind.value }))

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

/** What this scope pays, through the one price selection contract. */
function priceLabel(product: Product) {
  const selection = { currency, location_id: locationId.value, at: new Date().toISOString() }
  const offers = product.variants.flatMap(variant => selectPrice(variant.prices, selection) ?? [])
  const lowest = offers.reduce<typeof offers[number] | null>((best, offer) => (!best || offer.unit_amount < best.unit_amount ? offer : best), null)
  return formatProductMoney(lowest)
}

const rows = computed(() => catalog.products.value
  .filter(product => kind.value === 'all' || product.kind === kind.value)
  .toSorted((left, right) => left.name.localeCompare(right.name)))
const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'catalog',
  items: rows.value.map(product => ({
    id: product.id,
    label: product.name,
    summary: [PRODUCT_KIND_LABELS[product.kind], priceLabel(product) || 'No price set'].join(' · '),
    image: mediaStillUrl(product.image ?? undefined) ?? null,
    to: scoped(`${level.path.value}/${product.id}`),
  })),
}])

useSeoMeta({ title: 'Catalog | Krabiclaw Dashboard', robots: 'noindex, nofollow' })
</script>
