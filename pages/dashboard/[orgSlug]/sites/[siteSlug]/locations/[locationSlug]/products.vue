<template>
  <!--
    The open level is deeper than one of my children, so neither column is
    mine. Rendering my index anyway is what put a third column on screen.
  -->
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A surface is open: I am the index column, it is the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="location-catalog">
    <template #header>
      <UDashboardNavbar :title="catalogTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="locationPath" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="productsPath"
        :detail-title="detailTitle"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <CatalogSurfaceList />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <!-- Nothing below me is open, so I am my parent's detail column. -->
  <CatalogSurfaceList v-else />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import CatalogSurfaceList from '~/components/dashboard/CatalogSurfaceList.vue'
import { catalogLabel, countCatalog, isCatalogSurface, presentationForSurface } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const productsPath = computed(() => `${locationPath.value}/products`)
const frame = useEditorFrame(productsPath)

const siteId = await useDashboardSiteId()
const locationId = computed(() => dashboardLocation.currentLocation.value?.id ?? null)
// The same catalog the surfaces below read, so titling this column costs no request.
const catalog = useLocationProductCatalog(siteId, locationId)
// This level is the catalog, not one of its surfaces: a restaurant that also
// takes bookings holds a Menu and Experiences, and neither names the other.
const catalogTitle = computed(() => catalogLabel(vertical, countCatalog(catalog.products.value)))
// The detail column holds one surface, named the way that surface is named.
const detailTitle = computed(() => {
  const segment = frame.childSegment.value ?? ''
  return isCatalogSurface(vertical, segment) ? presentationForSurface(vertical, segment).collectionLabel : catalogTitle.value
})
</script>
