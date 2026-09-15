<template>
  <!--
    The list is the parent level's own column, so with nothing open there is
    no detail to draw. This exists so /dev/notifications resolves to it.
  -->
  <NotificationCatalogEntry v-if="first" :key="first" :id="first" />
</template>

<script setup lang="ts">
import NotificationCatalogEntry from '~/components/dashboard/NotificationCatalogEntry.vue'

definePageMeta({ layout: 'dashboard', auth: true })

const { entries } = await useNotificationCatalog()
const first = computed(() => entries.value[0]?.id)
</script>
