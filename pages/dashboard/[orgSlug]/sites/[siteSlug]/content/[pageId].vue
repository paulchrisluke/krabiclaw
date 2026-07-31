<template>
  <CmsContentEditor :site-id="siteId" scope="site" :page-id="pageId" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'editor' })

const route = useRoute()
const siteId = await useDashboardSiteId()
const pageId = computed(() => String(route.params.pageId ?? ''))

await assertDashboardContentPageAvailable(siteId, pageId.value, 'site')

useSeoMeta({ title: 'Content Editor | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
