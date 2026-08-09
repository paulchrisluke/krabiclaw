<template>
  <OrganizationPlaceholderPage
    slug="calendar"
    title="Calendar"
    description="Your organization calendar is coming soon."
    icon="i-lucide-calendar-days"
  />
</template>

<script setup lang="ts">
import OrganizationPlaceholderPage from '~/lib/components/workspace/dashboard/OrganizationPlaceholderPage.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Calendar | KrabiClaw', robots: 'noindex, nofollow' })
</script>
