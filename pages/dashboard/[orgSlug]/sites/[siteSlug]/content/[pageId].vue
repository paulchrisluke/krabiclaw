<template>
  <CmsContentEditor :site-id="siteId" scope="site" :page-id="pageId" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'editor', ssr: false })

const route = useRoute()
const siteId = await useDashboardSiteId()
const pageId = computed(() => route.params.pageId as string)

useSeoMeta({ title: 'Content Editor | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
