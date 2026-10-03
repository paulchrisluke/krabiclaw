<template>
  <div class="space-y-6 rounded-lg border border-default bg-default p-6">
    <h1 class="text-xl font-semibold">Connection failed</h1>
    <UAlert color="error" variant="soft" :description="message" />
    <UButton to="/dashboard" block>Return to dashboard</UButton>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'access', auth: false })
useSeoMeta({ title: 'Connection failed | KrabiClaw', robots: 'noindex, nofollow' })
const route = useRoute()
const message = computed(() => oauthErrorMessage(route.query.error, route.query.error_description)
  || 'The provider connection failed. Return to Settings → Integrations and start Connect again.')
</script>
