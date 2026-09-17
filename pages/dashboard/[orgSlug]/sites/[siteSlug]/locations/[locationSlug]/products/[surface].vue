<template>
  <!--
    The open level is deeper than one of my children, so neither column is
    mine. Rendering my index anyway is what put a third column on screen.
  -->
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A collection is open: I am the index column, it is the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="location-products">
    <template #header>
      <UDashboardNavbar :title="presentation.collectionLabel" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="productsPath" :label="catalogTitle" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="surfacePath"
        :detail-title="presentation.collectionGroupLabel"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <CollectionList :surface="surface" />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <!-- Nothing below me is open, so I am my parent's detail column. -->
  <CollectionList v-else :surface="surface" />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import CollectionList from '~/components/dashboard/CollectionList.vue'
import { catalogLabel, countCatalog, isCatalogSurface, presentationForSurface } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })

// A segment that names no surface of this vertical is not a page. A location
// sells its own goods and, where it takes bookings, experiences; anything else
// in this slot is a URL nobody can reach from the catalog.
const segment = String(route.params.surface ?? '')
if (!isCatalogSurface(vertical, segment)) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
const surface = segment
const presentation = presentationForSurface(vertical, surface)

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const productsPath = computed(() => `${locationPath.value}/products`)
const surfacePath = computed(() => `${productsPath.value}/${surface}`)
const frame = useEditorFrame(surfacePath)

const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
// The same catalog the list below reads, so titling this column costs no request.
const catalog = useLocationProductCatalog(siteId, locationId)
// The level above is the whole catalog, which one surface's word cannot name.
const catalogTitle = computed(() => catalogLabel(vertical, countCatalog(catalog.products.value)))
</script>
