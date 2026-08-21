<template>
  <TenantPageEditor :key="pageId" :page-id="pageId" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const pageId = String(route.params.pageId || '')
if (!pageId) throw createError({ statusCode: 400, statusMessage: 'Page ID is required' })

useSeoMeta({ title: 'Edit Page | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
