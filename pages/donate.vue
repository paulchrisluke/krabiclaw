<template>
  <NuxtLayout name="blawby">
    <BlawbyTenantPage
      path="/donate"
      fallback-eyebrow="Support"
      fallback-title="Donate"
      fallback-summary="Support this organization through its preferred donation page."
      fallback-body="Donation processing is handled externally for now. Use the donation link configured for this site to continue."
    />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })

definePageMeta({ layout: false })
</script>
