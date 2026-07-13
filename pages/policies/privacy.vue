<template>
  <NuxtLayout name="blawby">
    <BlawbyTenantPage
      path="/policies/privacy"
      fallback-eyebrow="Policy"
      fallback-title="Privacy Policy"
      fallback-summary="How this organization handles information submitted through this website."
    />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })

definePageMeta({ layout: false })
</script>
