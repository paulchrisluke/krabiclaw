<template>
  <section class="space-y-6">
    <div v-if="loading" class="space-y-3">
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

    <UPageList v-else class="gap-3">
      <UPageCard
        v-for="surface in surfaces"
        :key="surface.id"
        :to="surface.to"
        :title="surface.label"
        :description="surface.summary"
        variant="soft"
        :highlight="surface.id === openSurface"
        :ui="{ container: 'min-w-0 p-5 sm:p-5', title: 'text-[15px]', description: 'mt-1' }"
      >
        <!-- The strip takes the card's width and the pictures share it: four
             thumbnails at 96px overran a phone and scrolled the whole column. -->
        <div v-if="surface.previews.length" class="flex w-full gap-2">
          <img
            v-for="(preview, index) in surface.previews"
            :key="index"
            :src="preview"
            alt=""
            class="aspect-[20/19] min-w-0 flex-1 max-w-24 rounded-xl object-cover"
            loading="lazy"
          >
        </div>
      </UPageCard>
    </UPageList>
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
// A skeleton means "there is nothing to show yet", not "a refetch is in
// flight". Keyed on `pending` alone, a server render that had the rows in hand
// still drew the placeholder, and the client hydrated the real list over it --
// the catalog column's hydration mismatch.
const loading = computed(() => catalog.pending.value && !catalog.collections.value.length && !catalog.products.value.length)
const counts = computed(() => countCatalog(catalog.products.value))
const catalogTitle = computed(() => catalogLabel(vertical, counts.value))
const loadError = computed(() => (catalog.error.value ? getErrorMessage(catalog.error.value, `Failed to load ${catalogTitle.value.toLowerCase()}`) : null))
useSeoMeta({ title: () => `${catalogTitle.value} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })

// One row per surface the catalog actually reaches, so a restaurant that sells
// only food opens straight onto its Menu and never meets an Experiences row it
// has nothing to put in. The card shows what the surface holds, the way the
// location's own hub shows its photographs.
const surfaces = computed(() => catalogSurfaces(vertical, counts.value).map((surface) => {
  const words = presentationForSurface(vertical, surface)
  const products = catalog.products.value.filter(product => productSurfaceOf(vertical, product) === surface)
  return {
    id: surface,
    label: words.collectionLabel,
    summary: catalogSummary(vertical, countCatalog(products)),
    previews: products.flatMap(product => product.image?.public_url ?? []).slice(0, 4),
    to: `${productsPath.value}/${surface}`,
  }
}))
</script>
