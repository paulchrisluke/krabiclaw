<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawby ? 'blawby' : 'saya'">
    <LazyBlawbyTenantPage v-if="isBlawby" :path="documentPath" />
    <TenantPublicPage v-else :path="documentPath" />
  </NuxtLayout>
</template>

<script setup lang="ts">
const { isPlatform } = useTenantSite()
const { isBlawby } = usePublicTemplate()
// KrabiClaw's plans are a published page document whose feature_grid names the
// `billing_plans` source; the amounts stay in the Stripe-backed billing
// response (#903). A template that declares no pricing document — Saya — gets
// the 404 its registry entry already states, instead of the platform's own
// sales page rendered on a customer host.
const documentPath = useTenantPageDocumentPath('pricing')

definePageMeta({ layout: false })
</script>
