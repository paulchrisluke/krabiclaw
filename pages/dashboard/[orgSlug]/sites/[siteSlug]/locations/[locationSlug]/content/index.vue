<template>
  <CmsContentEditor :site-id="siteId" scope="location" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'editor', ssr: false })

const siteId = await useDashboardSiteId()

useSeoMeta({ title: 'Content Editor | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
