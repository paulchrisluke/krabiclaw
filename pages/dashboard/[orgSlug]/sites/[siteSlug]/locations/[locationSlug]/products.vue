<template>
  <!--
    The open level is deeper than one of my children, so neither column is
    mine. Rendering my index anyway is what put a third column on screen.
  -->
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!--
    One panel either way: this level always owns a column and always titles it.
    When a surface is open that column is the index and the surface takes the
    other; when nothing is open this is the column my parent put me in.
  -->
  <template v-else>
    <UDashboardPanel
      id="location-catalog"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar :title="catalogTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <CatalogSurfaceList />
        </div>
      </template>
    </UDashboardPanel>

    <NuxtPage v-if="hasDetail" />
  </template>
</template>

<script setup lang="ts">
import CatalogSurfaceList from '~/components/dashboard/CatalogSurfaceList.vue'
import { catalogLabel, countCatalog } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard' })

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
const hasDetail = computed(() => frame.mode.value === 'pair')
</script>
