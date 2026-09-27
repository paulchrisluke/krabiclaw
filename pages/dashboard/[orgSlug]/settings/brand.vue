<template>
  <OrganizationSettingsPage surface="brand" />
</template>

<script setup lang="ts">
// A row on Menu, nested under it so Menu is both its pane and its Back; the URL stays `/brand`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/brand' })
</script>
