<template>
  <OrganizationSettingsPage surface="brand" />
</template>

<script setup lang="ts">
// Brand is a row on Menu, which is where Back goes.
definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug-settings' })
</script>
