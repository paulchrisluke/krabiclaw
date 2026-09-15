<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawby ? 'blawby' : 'saya'">
    <TenantPublicPage :path="documentPath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform } = useTenantSite()
const { isBlawby } = usePublicTemplate()
// One About page for every site, KrabiClaw's own included (#903).
const documentPath = useTenantPageDocumentPath('about')
</script>
