<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawby ? 'blawby' : 'saya'">
    <PlatformAboutPage v-if="isPlatform" />
    <TenantPublicPage v-else path="/about" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform } = useTenantSite()
const { isBlawby } = usePublicTemplate()
</script>
