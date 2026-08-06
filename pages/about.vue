<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawby ? 'blawby' : 'saya'">
    <section v-if="isPlatform" class="mx-auto max-w-4xl px-6 py-24">
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-primary">About KrabiClaw</p>
      <h1 class="mt-4 text-5xl font-bold tracking-tight">Websites that local businesses can actually run.</h1>
      <p class="mt-6 max-w-2xl text-lg leading-8 text-muted">KrabiClaw combines a polished public site with a canonical content system that owners can manage from the dashboard, ChowBot, and MCP.</p>
    </section>
    <TenantPublicPage v-else path="/about" />
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const { isPlatform } = useTenantSite()
const { isBlawby } = usePublicTemplate()
</script>
