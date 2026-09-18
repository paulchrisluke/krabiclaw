<template>
  <NotificationCatalogEntry :key="id" :id="id" />
</template>

<script setup lang="ts">
import NotificationCatalogEntry from '~/components/dashboard/NotificationCatalogEntry.vue'

definePageMeta({ layout: 'dashboard', auth: true })

const route = useRoute()
const id = computed(() => (Array.isArray(route.params.id) ? route.params.id[0] : route.params.id) ?? '')
</script>
