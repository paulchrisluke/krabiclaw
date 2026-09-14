<template>
  <NuxtLayout name="blawby">
    <BlawbyTenantPage :path="documentPath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
const documentPath = useTenantPageDocumentPath('terms')
if (!isBlawby.value) throw createError({ statusCode: 404 })

definePageMeta({ layout: false })
</script>
