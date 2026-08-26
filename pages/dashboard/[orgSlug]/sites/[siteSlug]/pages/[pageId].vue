<template>
  <TenantPageEditor :key="pageId" :page-id="pageId" />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', mobileBottomNav: false })

const route = useRoute()
const pageId = computed(() => String(route.params.pageId || ''))
if (!pageId.value) throw createError({ statusCode: 400, statusMessage: 'Page ID is required' })

useSeoMeta({ title: 'Edit Page | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
