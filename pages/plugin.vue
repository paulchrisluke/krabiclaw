<template>
  <NuxtLayout name="platform">
    <TenantPublicPage :path="documentPath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

// The ChatGPT connection guide is KrabiClaw's own page, published through the
// CMS like the rest of its marketing (#903).
const { isPlatform } = useTenantSite()
if (!isPlatform) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
const documentPath = useTenantPageDocumentPath('/plugin', 'path')
</script>
