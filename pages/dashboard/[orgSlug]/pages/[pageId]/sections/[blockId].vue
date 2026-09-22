<template>
  <TenantPageBlockEditorPage :site-id="siteId" :page-id="pageId" :block-id="blockId" />
</template>

<script setup lang="ts">
import TenantPageBlockEditorPage from '~/components/dashboard/TenantPageBlockEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const pageId = computed(() => String(route.params.pageId ?? ''))
const blockId = computed(() => String(route.params.blockId ?? ''))
const siteId = await useDashboardOrganizationId()
</script>
