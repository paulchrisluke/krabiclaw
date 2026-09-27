<template>
  <ReviewEditorPage :location-id="locationId" />
</template>

<script setup lang="ts">
import ReviewEditorPage from '~/components/dashboard/ReviewEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const dashboardLocation = useDashboardLocation()
// Reactive: Nuxt reuses this component when only the location slug changes.
// `[locationSlug].vue` raises the 404 for a slug that names none, so this level is only reached through a real one.
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')
</script>
