<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">
    <TenantPublicPage v-if="isPlatform" :path="documentPath" />
    <LazySayaExperienceCatalog v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

// On KrabiClaw's own host /experiences sells the product and is a published
// platform page document (#903). On a customer host it is that site's bookable
// catalog, unchanged, in the Saya markup it has always used.
const { isPlatform } = useTenantSite()
const { isBlawby } = usePublicTemplate()
if (isBlawby.value) throw createError({ statusCode: 404 })
const documentPath = useTenantPageDocumentPath('/experiences', 'path')
</script>
