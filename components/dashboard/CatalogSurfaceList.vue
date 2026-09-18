<template>
  <section class="space-y-6">
    <header>
      <h1 class="min-w-0 truncate text-2xl font-semibold text-highlighted">{{ catalogTitle }}</h1>
      <p class="mt-2 text-sm text-muted">{{ description }}</p>
    </header>

    <div v-if="pending" class="space-y-3">
      <USkeleton v-for="index in 2" :key="index" class="h-28 rounded-2xl" />
    </div>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="`${catalogTitle} could not be loaded`"
      :description="loadError"
    />

    <EditorNavigationList v-else :groups="surfaceGroups" :active-item="openSurface" variant="cards" />
  </section>
</template>

<script setup lang="ts">
// The catalog's own level: one row per surface the location sells on. Rendered
// by `products.vue`, which decides whether it is the whole screen, the index
// column of a pair, or off screen entirely.
//
// A surface is how customers read the catalog, not a record the merchant keeps:
// the rows are derived from what the location carries, so there is nothing here
// to add, rename, reorder or delete. That is why this level is a navigation
// list and not a list editor.
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { getErrorMessage } from '~/utils/errors'
import {
  catalogLabel,
  catalogSummary,
  catalogSurfaces,
  countCatalog,
  presentationForSurface,
  productSurfaceOf,
} from '~/utils/product-presentation'

const route = useRoute()
const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })

const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const productsPath = computed(() => `${locationPath.value}/products`)
const openSurface = computed(() => String(route.params.surface ?? '') || null)

const catalog = useLocationProductCatalog(siteId, locationId)
const pending = catalog.pending
const counts = computed(() => countCatalog(catalog.products.value))
const catalogTitle = computed(() => catalogLabel(vertical, counts.value))
const loadError = computed(() => (catalog.error.value ? getErrorMessage(catalog.error.value, `Failed to load ${catalogTitle.value.toLowerCase()}`) : null))
useSeoMeta({ title: () => `${catalogTitle.value} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })

// One row per surface the catalog actually reaches, so a restaurant that sells
// only food opens straight onto its Menu and never meets an Experiences row it
// has nothing to put in. The card shows what the surface holds, the way the
// location's own hub shows its photographs.
const surfaceGroups = computed<EditorNavigationGroup[]>(() => [{
  id: 'catalog',
  items: catalogSurfaces(vertical, counts.value).map((surface) => {
    const words = presentationForSurface(vertical, surface)
    const products = catalog.products.value.filter(product => productSurfaceOf(vertical, product) === surface)
    return {
      id: surface,
      label: words.collectionLabel,
      summary: catalogSummary(vertical, countCatalog(products)),
      placeholder: products.length === 0,
      previews: products.flatMap(product => product.image?.public_url ?? []).slice(0, 4),
      to: `${productsPath.value}/${surface}`,
    }
  }),
}])

const description = computed(() => (surfaceGroups.value[0]!.items.length > 1
  ? 'Customers read each of these separately.'
  : `Everything this location offers, in the order customers read it.`))

watch(locationId, () => { void catalog.refresh() }, { immediate: true })
</script>
