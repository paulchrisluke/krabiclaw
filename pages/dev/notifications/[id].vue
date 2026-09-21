<template>
  <!-- A preview has nothing to save. -->
  <DashboardLeafPanel id="notification-catalog-entry" :title="title" :footer="false">
    <NotificationCatalogEntry :key="id" :id="id" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import NotificationCatalogEntry from '~/components/dashboard/NotificationCatalogEntry.vue'

definePageMeta({ layout: 'dashboard', auth: true })

const route = useRoute()
const id = computed(() => (Array.isArray(route.params.id) ? route.params.id[0] : route.params.id) ?? '')
const { entries } = await useNotificationCatalog()
const title = computed(() => entries.value.find(entry => entry.id === id.value)?.title ?? 'Message')
</script>
