<template>
  <QaEditorPage :location-id="locationId" />
</template>

<script setup lang="ts">
import QaEditorPage from '~/components/dashboard/QaEditorPage.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.qa', ownsChrome: true })

const dashboardLocation = useDashboardLocation()
// Reactive: Nuxt reuses this component when only the location slug changes.
const locationId = computed(() => {
  const id = dashboardLocation.currentLocationId.value
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  return id
})
</script>
