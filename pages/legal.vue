<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawby ? 'blawby' : 'saya'">
    <TenantPublicPage :path="documentPath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform } = useTenantSite()
const { isBlawby } = usePublicTemplate()
// KrabiClaw's own legal page is a published platform page document now, and a
// customer site renders whatever it published at this path through the same
// loader (#903). The page used to carry its editorial copy inline and render
// every tenant inside the platform layout.
const documentPath = useTenantPageDocumentPath('/legal', 'path')
</script>
