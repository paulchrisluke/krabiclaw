<template>
  <!--
    The open level is deeper than one of my children, so neither column is
    mine. Rendering my index anyway is what put a third column on screen.
  -->
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!--
    One panel either way: this level always owns a column and always titles it.
    When a collection is open that column is the index and the collection takes
    the other; when nothing is open this is the column my parent put me in.
  -->
  <template v-else>
    <UDashboardPanel
      id="location-products"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar :title="presentation.collectionLabel" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <CollectionList :surface="surface" />
        </div>
      </template>
    </UDashboardPanel>

    <NuxtPage v-if="hasDetail" />
  </template>
</template>

<script setup lang="ts">
import CollectionList from '~/components/dashboard/CollectionList.vue'
import { isCatalogSurface, presentationForSurface } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const dashboard = useDashboardSite()

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

const hasDetail = computed(() => frame.mode.value === 'pair')
</script>
