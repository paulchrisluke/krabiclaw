<template>
  <DashboardIndexPanel v-if="surface && presentation" id="location-products" :title="presentation.collectionLabel">
    <CollectionList :surface="surface" />
  </DashboardIndexPanel>
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
const surface = isCatalogSurface(vertical, segment) ? segment : null
if (!surface) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
const presentation = surface ? presentationForSurface(vertical, surface) : null
</script>
