<template>
  <NuxtLayout name="blawby">
    <BlawbyTenantPage path="/third-party-notices" />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })

definePageMeta({ layout: false })
</script>
