<template>
  <NuxtLayout name="platform">
    <TenantPublicPage :path="documentPath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

// /features is KrabiClaw's own marketing page and nobody else's. It used to
// hold its editorial copy inline and render that copy on every tenant host too;
// it is a published platform page document now, and a customer site asking for
// /features gets the 404 its own template already answers with (#903).
const { isPlatform } = useTenantSite()
if (!isPlatform) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
const documentPath = useTenantPageDocumentPath('/features', 'path')
</script>
