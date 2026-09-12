<template>
  <!--
    The open level is deeper than one of my children, so neither column is
    mine. Rendering my index anyway is what put a third column on screen.
  -->
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A category is open: I am the index column, it is the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="location-products">
    <template #header>
      <UDashboardNavbar :title="presentation.collectionLabel" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="locationPath" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="productsPath"
        :detail-title="presentation.itemLabel"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <CollectionList />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <!-- Nothing below me is open, so I am my parent's detail column. -->
  <CollectionList v-else />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import CollectionList from '~/components/dashboard/CollectionList.vue'
import { requireProductPresentation } from '~/utils/product-presentation'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })

const route = useRoute()
const dashboard = useDashboardSite()

const vertical = dashboard.site.value?.vertical
if (!vertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
const presentation = requireProductPresentation(vertical)

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const productsPath = computed(() => `${locationPath.value}/products`)
const frame = useEditorFrame(productsPath)
</script>
