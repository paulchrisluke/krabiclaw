<template>
  <NotificationCatalogPage />
</template>

<script setup lang="ts">
import NotificationCatalogPage from '~/components/dashboard/NotificationCatalogPage.vue'

definePageMeta({ layout: 'dashboard', ownsChrome: true, auth: true })
</script>
