<template>
  <LocationsPage />
</template>

<script setup lang="ts">
import LocationsPage from '~/components/dashboard/LocationsPage.vue'

// A row on Menu, nested under it so Menu is both its pane and its Back; the URL stays `/locations`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/locations' })
</script>
