<template>
  <NuxtLayout name="blawby">
    <BlawbyTenantPage
      path="/third-party-notices"
      fallback-eyebrow="Notices"
      fallback-title="Third-Party Notices"
      fallback-summary="Notices for third-party tools, links, and services used by this website."
    />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })

definePageMeta({ layout: false })
</script>
