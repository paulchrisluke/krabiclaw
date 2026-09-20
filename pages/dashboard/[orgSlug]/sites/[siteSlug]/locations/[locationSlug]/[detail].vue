<template>
  <LocationSettingsPage :detail="String(route.params.detail)" />
</template>

<script setup lang="ts">
// A hub card's editor: name, description, hours, address, contact or the
// reservation policy, rendered as the location's detail column.
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
</script>
