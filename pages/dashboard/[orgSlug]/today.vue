<template>
  <OrganizationPlaceholderPage
    slug="today"
    title="Today"
    description="Your organization’s daily overview is coming soon."
    icon="i-lucide-sun"
  />
</template>

<script setup lang="ts">
import OrganizationPlaceholderPage from '~/lib/components/workspace/dashboard/OrganizationPlaceholderPage.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Today | KrabiClaw', robots: 'noindex, nofollow' })
</script>
