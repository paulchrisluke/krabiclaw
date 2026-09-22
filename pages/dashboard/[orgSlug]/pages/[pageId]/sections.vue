<template>
  <TenantPageSections :site-id="siteId" :page-id="pageId" />
</template>

<script setup lang="ts">
import TenantPageSections from '~/components/dashboard/TenantPageSections.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const pageId = computed(() => String(route.params.pageId ?? ''))
const siteId = await useDashboardOrganizationId()
</script>
