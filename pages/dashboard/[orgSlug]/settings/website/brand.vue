<template>
  <OrganizationSettingsPage surface="brand" />
</template>

<script setup lang="ts">
// A row on Website, nested under it so Website is both its pane and its Back; the URL stays `/brand`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/brand' })
</script>
