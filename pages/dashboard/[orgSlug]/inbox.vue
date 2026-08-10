<template>
  <OrganizationPlaceholderPage
    slug="inbox"
    title="Inbox"
    description="Organization-wide messages and requests will appear here."
    icon="i-lucide-inbox"
  />
</template>

<script setup lang="ts">
import OrganizationPlaceholderPage from '~/lib/components/workspace/dashboard/OrganizationPlaceholderPage.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Inbox | KrabiClaw', robots: 'noindex, nofollow' })
</script>
