<template>
  <NuxtLayout name="blawby">
    <BlawbyTenantPage
      path="/policies/terms"
      fallback-eyebrow="Policy"
      fallback-title="Terms of Use"
      fallback-summary="Terms and notices for using this website."
    />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })

definePageMeta({ layout: false })
</script>
